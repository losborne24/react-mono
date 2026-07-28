import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { IconPlus, IconMinus, IconZoomReset } from '@tabler/icons-react';
import type { SourceImage } from '@react-mono/models';

const MIN_SCALE = 1;
const MAX_SCALE = 150;
const ZOOM_SENSITIVITY = 0.01;
/** Multiplier per +/− button press. */
const ZOOM_STEP = 1.8;
/**
 * Largest edge (px) of the backing canvas. The mosaic is one <canvas> instead of
 * ~40k <img> nodes, so the only crispness knob is the bitmap resolution: bigger =
 * sharper when zoomed, but more GPU memory. 4096 stays within every browser's max
 * texture size and keeps tiles legible well into the zoom range.
 */
const MAX_CANVAS_DIM = 4096;
/**
 * Export sizing for the downloaded/shared image, independent of the on-screen
 * MAX_CANVAS_DIM cap. A save is a one-off (not a per-frame texture), so we can afford a
 * much bigger bitmap: each tile is stamped at up to EXPORT_CELL px, with the longer edge
 * capped at EXPORT_MAX_DIM, giving crisp album art instead of the ~20px tiles seen on
 * screen. Sized to stay within browsers' max canvas dimension.
 */

/** Target px per exported tile. */
const EXPORT_CELL = 256;
/**
 * Hard cap on the longer edge of the exported bitmap. 8192 keeps the raster ~67MP: JPEG
 * encodes in ~2.4s at ~1MB (measured). A 16k canvas is ~264MP and encodes far slower.
 * The SVG export is the path for full-detail tiles beyond this.
 */
const EXPORT_MAX_DIM = 8192;

/** Safety valve so huge/near-square grids can't allocate a canvas the browser rejects. */
const EXPORT_MAX_AREA = 8192 * 8192;

/**
 * Per-tile pixel size for the SVG export. Unlike the PNG, the SVG stores each unique
 * cover once and references it per cell, so this size never hits a canvas ceiling —
 * every tile is full-detail regardless of how many tiles the grid has.
 */
const SVG_TILE_PX = 256;

/** JPEG quality for tiles embedded in the SVG — balances crispness against file size. */
const SVG_TILE_QUALITY = 0.82;

/**
 * Quality for the flat raster JPEG export. Kept below 0.9 so Chrome uses 4:2:0 chroma
 * subsampling (it switches to bulkier 4:4:4 at ≥0.9). JPEG — not WebP — on purpose:
 * at these sizes the WebP encoder is 3–4× slower (~11s vs ~2.4s at 8192px, measured)
 * for no reliable size win on high-frequency tile content.
 */
const EXPORT_JPEG_QUALITY = 0.8;

/** Px per exported tile, clamped to the dim and area caps. */
function exportCell(cols: number, rows: number): number {
  const dimCap = Math.floor(EXPORT_MAX_DIM / Math.max(cols, rows));
  const areaCap = Math.floor(Math.sqrt(EXPORT_MAX_AREA / (cols * rows)));
  return Math.max(1, Math.min(EXPORT_CELL, dimCap, areaCap));
}
/**
 * Max visible cells for a live per-frame detail redraw. Above this the drawImage
 * cost per frame risks dropping below 60fps, so the overlay is hidden and the base
 * canvas shows instead (only happens at low zoom, where the base is already ~1:1).
 */
const DETAIL_MAX_CELLS = 2500;

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Keep the pan within bounds so the scaled content can't be dragged off-frame. */
function clampTransform(t: Transform, width: number, height: number): Transform {
  const scale = clamp(t.scale, MIN_SCALE, MAX_SCALE);
  const maxX = (width * (scale - 1)) / 2;
  const maxY = (height * (scale - 1)) / 2;
  return { scale, x: clamp(t.x, -maxX, maxX), y: clamp(t.y, -maxY, maxY) };
}

export interface MosaicGridProps {
  image: SourceImage;
  /** Album/playlist artwork used as mosaic tiles. Each carries an average `color`. */
  tiles: SourceImage[];
  /** Tile count along the image's longer edge; the shorter edge follows its aspect. */
  resolution?: number;
  /** Selected matching-algorithm id (see MATCH_ALGORITHMS). Controlled by the parent. */
  algorithm?: string;
  /** Reports the derived grid once the image aspect is known (for stats/labels). */
  onGrid?: (grid: { cols: number; rows: number }) => void;
}

/** Imperative handle for exporting the painted mosaic (download/share). */
export interface MosaicGridHandle {
  /** The mosaic as a JPEG blob, or `null` if not painted yet. */
  toBlob: () => Promise<Blob | null>;
  /**
   * The mosaic as a self-contained SVG that embeds each unique cover once — full
   * 256px per tile at any density. `null` if the mosaic isn't painted yet.
   */
  toSvg: () => Promise<Blob | null>;
}

type RGB = [number, number, number];

/** Parse a `rgb(r, g, b)` string into a tuple, or `null` if it can't. */
function parseRgb(color: string | undefined): RGB | null {
  if (!color) return null;
  const m = color.match(/(\d+)\D+(\d+)\D+(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

/** Squared euclidean distance in RGB space (sqrt unneeded for nearest). */
function dist2(a: RGB, b: RGB): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

interface SampledGrid {
  cols: number;
  rows: number;
  cells: RGB[];
}

/**
 * Sample the target image into a grid of average pixel colours by drawing it
 * downscaled onto a canvas — one cell per slot. The grid is sized to `resolution`
 * tiles on the image's longer edge, with the shorter edge derived from its aspect
 * ratio so the mosaic isn't stretched.
 *
 * Best-effort: a CORS-tainted canvas or load failure resolves to `null`.
 */
function sampleGrid(url: string, resolution: number): Promise<SampledGrid | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const { naturalWidth: w, naturalHeight: h } = img;
        const landscape = w >= h;
        const cols = landscape ? resolution : Math.max(1, Math.round((resolution * w) / h));
        const rows = landscape ? Math.max(1, Math.round((resolution * h) / w)) : resolution;

        const canvas = document.createElement('canvas');
        canvas.width = cols;
        canvas.height = rows;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, cols, rows);
        const { data } = ctx.getImageData(0, 0, cols, rows);
        const cells: RGB[] = [];
        for (let i = 0; i < cols * rows; i++) {
          const o = i * 4;
          cells.push([data[o], data[o + 1], data[o + 2]]);
        }
        resolve({ cols, rows, cells });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

interface MatchedCell {
  url: string;
  /** Matched tile's average colour — painted immediately while art decodes. */
  rgb: RGB;
}

/** CIELAB colour — perceptually uniform, so euclidean distance ≈ perceived difference. */
type Lab = [number, number, number];

/** sRGB (0–255) → CIELAB, via linearised RGB and the D65 XYZ space. */
function rgbToLab([r, g, b]: RGB): Lab {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const rl = lin(r);
  const gl = lin(g);
  const bl = lin(b);
  // Linear RGB → XYZ (D65), then normalise by the reference white.
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Squared euclidean distance between two Lab colours. */
function labDist2(a: Lab, b: Lab): number {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

interface Swatch {
  url: string;
  rgb: RGB;
  lab: Lab;
}

/** Parse tiles into colour swatches, dropping any without a readable average colour. */
function toSwatches(tiles: SourceImage[]): Swatch[] {
  return tiles
    .map((t) => {
      const rgb = parseRgb(t.color);
      return rgb ? { url: t.url, rgb, lab: rgbToLab(rgb) } : null;
    })
    .filter((s): s is Swatch => s !== null);
}

/** Nearest tile by raw RGB distance. Fast, but perceptually uneven. */
function matchNearestRgb(grid: RGB[], tiles: SourceImage[]): MatchedCell[] {
  const swatches = toSwatches(tiles);
  if (!swatches.length) return [];
  return grid.map((cell) => {
    let best = swatches[0];
    let bestDist = dist2(cell, best.rgb);
    for (let i = 1; i < swatches.length; i++) {
      const d = dist2(cell, swatches[i].rgb);
      if (d < bestDist) {
        best = swatches[i];
        bestDist = d;
      }
    }
    return { url: best.url, rgb: best.rgb };
  });
}

/** Nearest tile in CIELAB space — matches how the eye judges colour difference. */
function matchPerceptual(grid: RGB[], tiles: SourceImage[]): MatchedCell[] {
  const swatches = toSwatches(tiles);
  if (!swatches.length) return [];
  return grid.map((cell) => {
    const cellLab = rgbToLab(cell);
    let best = swatches[0];
    let bestDist = labDist2(cellLab, best.lab);
    for (let i = 1; i < swatches.length; i++) {
      const d = labDist2(cellLab, swatches[i].lab);
      if (d < bestDist) {
        best = swatches[i];
        bestDist = d;
      }
    }
    return { url: best.url, rgb: best.rgb };
  });
}

/**
 * Perceptual match with a usage penalty: each pick adds a growing cost to that
 * tile, so heavily-reused tiles get nudged aside for near-ties. Spreads the album
 * artwork across the mosaic instead of stamping one dominant cover everywhere.
 */
function matchVariety(grid: RGB[], tiles: SourceImage[]): MatchedCell[] {
  const swatches = toSwatches(tiles);
  if (!swatches.length) return [];
  // Penalty scaled to Lab distances (~0–100²): a few reuses ≈ a small colour shift.
  const PENALTY = 40;
  const uses = new Array(swatches.length).fill(0);
  return grid.map((cell) => {
    const cellLab = rgbToLab(cell);
    let bestIdx = 0;
    let bestCost = labDist2(cellLab, swatches[0].lab) + uses[0] * PENALTY;
    for (let i = 1; i < swatches.length; i++) {
      const cost = labDist2(cellLab, swatches[i].lab) + uses[i] * PENALTY;
      if (cost < bestCost) {
        bestIdx = i;
        bestCost = cost;
      }
    }
    uses[bestIdx]++;
    return { url: swatches[bestIdx].url, rgb: swatches[bestIdx].rgb };
  });
}

/** A cell→tile matching strategy. More can be added; the toggle switches between them. */
type MatchAlgorithm = (grid: RGB[], tiles: SourceImage[]) => MatchedCell[];

interface MatchOption {
  id: string;
  label: string;
  match: MatchAlgorithm;
}

/** Available matching algorithms, in toggle order. */
const MATCH_OPTIONS: MatchOption[] = [
  { id: 'perceptual', label: 'Perceptual', match: matchPerceptual },
  { id: 'variety', label: 'Variety', match: matchVariety },
  { id: 'rgb', label: 'RGB', match: matchNearestRgb },
];

/** Public metadata for the matching algorithms, for a parent-rendered toggle. */
export interface MatchAlgorithmOption {
  id: string;
  label: string;
}

/** Selectable algorithms (id + label), in toggle order. */
export const MATCH_ALGORITHMS: MatchAlgorithmOption[] = MATCH_OPTIONS.map(({ id, label }) => ({
  id,
  label,
}));

/** Default matching algorithm id. */
export const DEFAULT_MATCH_ALGORITHM = MATCH_OPTIONS[0].id;

interface MosaicData {
  cols: number;
  rows: number;
  cells: MatchedCell[];
}

/**
 * Encode a canvas to `type`, but only if the browser actually honoured it — some
 * browsers silently fall back to PNG for unsupported types, so we reject a blob whose
 * MIME doesn't match the request. Returns `null` when the type isn't encodable.
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob && blob.type === type ? blob : null), type, quality),
  );
}

/** Encode the export canvas as JPEG — fast at these sizes and opens natively in Photos. */
function encodeExport(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return canvasToBlob(canvas, 'image/jpeg', EXPORT_JPEG_QUALITY);
}

/** Load an image for canvas drawing, or `null` on failure/taint. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Decoded tiles, keyed by URL, shared between the base paint and detail redraws. */
type TileCache = Map<string, HTMLImageElement>;

/**
 * Paint the mosaic onto a single canvas instead of mounting ~40k <img> nodes.
 *
 * Two passes:
 *  1. Fill every cell with its matched tile's average colour — instant, no I/O.
 *  2. Decode each *unique* tile once (there are far fewer unique tiles than cells)
 *     and draw it into all of its cells. Progressive: tiles appear as they decode.
 *
 * Decoded tiles land in `cache` for reuse by the detail redraw (see paintDetail).
 * `isStale()` lets the caller abort mid-decode (image swap / unmount).
 */
async function paintMosaic(
  canvas: HTMLCanvasElement,
  data: MosaicData,
  cache: TileCache,
  isStale: () => boolean,
): Promise<void> {
  const { cols, rows, cells } = data;
  // Size the backing store so the longer edge hits MAX_CANVAS_DIM; cells stay square.
  const cell = Math.max(1, Math.floor(MAX_CANVAS_DIM / Math.max(cols, rows)));
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Pass 1: average-colour blocks.
  for (let i = 0; i < cells.length; i++) {
    const [r, g, b] = cells[i].rgb;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect((i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
  }

  // Group cell indices by tile URL so each image decodes once, not once per cell.
  const byUrl = new Map<string, number[]>();
  for (let i = 0; i < cells.length; i++) {
    const list = byUrl.get(cells[i].url);
    if (list) list.push(i);
    else byUrl.set(cells[i].url, [i]);
  }

  // Pass 2: decode each unique tile and stamp it into all its cells.
  for (const [url, indices] of byUrl) {
    if (isStale()) return;
    // Reuse an already-decoded tile (e.g. after an algorithm toggle) instead of
    // re-fetching — avoids the avg-colour flash while identical bytes re-decode.
    let img = cache.get(url) ?? null;
    if (!img) {
      img = await loadImage(url);
      if (isStale()) return;
      if (!img) continue; // keep the avg-colour block for this tile
      cache.set(url, img);
    }
    for (const i of indices) {
      ctx.drawImage(img, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
    }
  }
}

/**
 * Render the full mosaic to a fresh offscreen canvas at export size (EXPORT_CELL px per
 * tile, capped by EXPORT_MAX_DIM/area) for download/share. Unlike the on-screen base
 * canvas — capped low for GPU memory — this stamps each unique tile at full crispness.
 * Reuses the decoded-tile cache and decodes any stragglers so the saved image never
 * falls back to avg-colour blocks.
 */
async function renderExport(data: MosaicData, cache: TileCache): Promise<HTMLCanvasElement> {
  const { cols, rows, cells } = data;
  const cell = exportCell(cols, rows);
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  // High-quality resampling when tiles are scaled to the cell size (default is 'low').
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Pass 1: average-colour blocks, so any tile that fails to decode still fills.
  for (let i = 0; i < cells.length; i++) {
    const [r, g, b] = cells[i].rgb;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect((i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
  }

  // Group cell indices by tile URL so each image decodes once, not once per cell.
  const byUrl = new Map<string, number[]>();
  for (let i = 0; i < cells.length; i++) {
    const list = byUrl.get(cells[i].url);
    if (list) list.push(i);
    else byUrl.set(cells[i].url, [i]);
  }

  // Pass 2: stamp each unique tile, decoding any not already cached from viewing.
  for (const [url, indices] of byUrl) {
    let img = cache.get(url) ?? null;
    if (!img) {
      img = await loadImage(url);
      if (!img) continue; // keep the avg-colour block for this tile
      cache.set(url, img);
    }
    for (const i of indices) {
      ctx.drawImage(img, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
    }
  }
  return canvas;
}

/** Decode a tile, draw it to a `size`px square, and return a JPEG data URI (or null). */
async function encodeTile(url: string, cache: TileCache, size: number): Promise<string | null> {
  let img = cache.get(url) ?? null;
  if (!img) {
    img = await loadImage(url);
    if (!img) return null;
    cache.set(url, img);
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', SVG_TILE_QUALITY);
}

/**
 * Serialise the mosaic as a self-contained SVG. Each *unique* cover is embedded once
 * in <defs> (as a 256px JPEG data URI) and referenced by a lightweight <use> per cell,
 * so file size scales with the number of unique tiles, not the cell count. Because the
 * tiles are referenced rather than rasterised into one bitmap, every cell stays full
 * 256px detail no matter the grid density — sidestepping the PNG's canvas-size ceiling.
 *
 * Caveat: a viewer still rasterises the whole thing to display it, so very dense grids
 * (e.g. 512²) may be slow or refuse to open at full size — this is an archival artifact.
 */
async function renderSvg(data: MosaicData, cache: TileCache): Promise<Blob> {
  const { cols, rows, cells } = data;

  // Unique tile URLs in first-seen order; each gets a short id and an avg-colour fallback.
  const idFor = new Map<string, string>();
  const rgbFor = new Map<string, RGB>();
  for (const c of cells) {
    if (idFor.has(c.url)) continue;
    idFor.set(c.url, `t${idFor.size.toString(36)}`);
    rgbFor.set(c.url, c.rgb);
  }

  // Embed each unique tile once, falling back to its average-colour block on failure.
  const defs: string[] = [];
  for (const [url, id] of idFor) {
    const uri = await encodeTile(url, cache, SVG_TILE_PX);
    if (uri) {
      defs.push(`<image id="${id}" width="${SVG_TILE_PX}" height="${SVG_TILE_PX}" href="${uri}"/>`);
    } else {
      const [r, g, b] = rgbFor.get(url) as RGB;
      defs.push(
        `<rect id="${id}" width="${SVG_TILE_PX}" height="${SVG_TILE_PX}" fill="rgb(${r},${g},${b})"/>`,
      );
    }
  }

  // One positioned <use> per cell — the bulk of the file, but only ~30 bytes each.
  const uses = new Array<string>(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const x = (i % cols) * SVG_TILE_PX;
    const y = Math.floor(i / cols) * SVG_TILE_PX;
    uses[i] = `<use href="#${idFor.get(cells[i].url)}" x="${x}" y="${y}"/>`;
  }

  const w = cols * SVG_TILE_PX;
  const h = rows * SVG_TILE_PX;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>${defs.join('')}</defs>${uses.join('')}</svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

/**
 * Redraw only the currently-visible cells onto an overlay canvas sized to the
 * frame's device pixels — so each tile is rasterized at its true on-screen size
 * instead of being a CSS-upscaled slice of the (capped) base bitmap. Called on
 * zoom-settle; the overlay then covers the blurry base while the view is static.
 *
 * The overlay is NOT transformed — it maps the visible slice of the mosaic (derived
 * from the frame rect + current transform) straight into frame-sized pixels. Cells
 * whose tile art hasn't decoded fall back to their average colour.
 */
function paintDetail(
  canvas: HTMLCanvasElement,
  data: MosaicData,
  cache: TileCache,
  t: Transform,
  frameW: number,
  frameH: number,
): void {
  const { cols, rows, cells } = data;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(frameW * dpr);
  canvas.height = Math.round(frameH * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // On-screen size of one cell, in device px. The content layer is `scale`-zoomed
  // and covers the whole frame at scale 1, so a cell spans frame/cols * scale.
  const cellW = (frameW / cols) * t.scale * dpr;
  const cellH = (frameH / rows) * t.scale * dpr;

  // Top-left of the content layer in device px, relative to the frame origin.
  // transformOrigin is centre: at scale s the content overflows by (s-1)/2 each
  // side, then the pan (t.x, t.y) shifts it.
  const originX = (-((t.scale - 1) / 2) * frameW + t.x) * dpr;
  const originY = (-((t.scale - 1) / 2) * frameH + t.y) * dpr;

  // Only touch cells overlapping the frame.
  const c0 = Math.max(0, Math.floor(-originX / cellW));
  const c1 = Math.min(cols - 1, Math.floor((canvas.width - originX) / cellW));
  const r0 = Math.max(0, Math.floor(-originY / cellH));
  const r1 = Math.min(rows - 1, Math.floor((canvas.height - originY) / cellH));

  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const cellData = cells[r * cols + c];
      const x = originX + c * cellW;
      const y = originY + r * cellH;
      const w = Math.ceil(cellW) + 1; // +1 avoids seams from fractional rounding
      const h = Math.ceil(cellH) + 1;
      const img = cache.get(cellData.url);
      if (img) {
        ctx.drawImage(img, x, y, w, h);
      } else {
        const [rr, gg, bb] = cellData.rgb;
        ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
        ctx.fillRect(x, y, w, h);
      }
    }
  }
}

interface ZoomButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
}

/** Icon button for the zoom overlay. Stops pointer events so it can't start a pan/pinch. */
function ZoomButton({ label, onClick, children }: ZoomButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
    >
      {children}
    </button>
  );
}

// Photomosaic: target image sampled per cell, each cell filled with the tile
// whose average colour is nearest to the sampled colour. The grid dimensions are
// derived from the image's aspect ratio (see `sampleGrid`), not fixed.
export const MosaicGrid = forwardRef<MosaicGridHandle, MosaicGridProps>(function MosaicGrid(
  { image, tiles, resolution = 22, algorithm = DEFAULT_MATCH_ALGORITHM, onGrid },
  ref,
) {
  const [dims, setDims] = useState<{ cols: number; rows: number } | null>(null);
  // Sampled target grid for the current image, reused when only the algorithm changes.
  const sampledRef = useRef<SampledGrid | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Overlay canvas, redrawn crisp on zoom-settle (see applyTransform's idle timer).
  const detailRef = useRef<HTMLCanvasElement>(null);
  // Decoded tiles + mosaic data kept for detail redraws without re-decoding.
  const tileCacheRef = useRef<TileCache>(new Map());
  const dataRef = useRef<MosaicData | null>(null);
  // Live transform lives in a ref, not state: the mosaic can be ~40k <img> nodes,
  // so re-rendering per frame is what makes pan/zoom lag. We write the transform
  // straight onto the (GPU-composited) content layer instead — no React reconcile.
  const transformRef = useRef<Transform>(IDENTITY);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: Transform;
  } | null>(null);
  // Active pointers on the frame, keyed by pointerId, for pinch detection.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Baseline for the current pinch gesture (null when fewer than 2 pointers down).
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  // Redraw the crisp overlay for the current transform. Runs every frame during
  // motion (no settle delay), so it must stay cheap: only when the visible-cell
  // count is small enough to redraw at 60fps. At/near scale 1 the base is already
  // ~1:1 (and the whole grid is visible → too many cells), so we hide the overlay
  // and let the base show; the overlay only takes over once zoomed in.
  const drawDetail = useCallback(() => {
    const frame = frameRef.current;
    const detail = detailRef.current;
    const data = dataRef.current;
    if (!frame || !detail || !data) return;
    const rect = frame.getBoundingClientRect();
    // Visible cells ≈ total / scale² (each axis shrinks by `scale`). Above the cap
    // the per-frame drawImage cost risks dropping frames — defer to the base.
    const t = transformRef.current;
    const visibleCells = (data.cols * data.rows) / (t.scale * t.scale);
    if (t.scale <= MIN_SCALE || visibleCells > DETAIL_MAX_CELLS) {
      detail.style.opacity = '0';
      return;
    }
    paintDetail(detail, data, tileCacheRef.current, t, rect.width, rect.height);
    detail.style.opacity = '1';
  }, []);

  // Push the current transform to the DOM on the next frame (coalesces bursts of
  // wheel/move events into one write per frame) and reflect zoom state on the cursor.
  const applyTransform = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const t = transformRef.current;
      if (contentRef.current) {
        const content = contentRef.current;
        content.style.transform = `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scale})`;
        content.style.willChange = 'transform';
      }
      // Redraw the crisp overlay in the same frame — no settle delay, so zooming
      // stays sharp. drawDetail decides whether it's cheap enough to show.
      drawDetail();
      if (frameRef.current) {
        const zoomed = t.scale > MIN_SCALE;
        frameRef.current.style.cursor = zoomed
          ? dragRef.current
            ? 'grabbing'
            : 'grab'
          : 'default';
      }
    });
  }, [drawDetail]);

  // Zoom to an absolute scale while keeping the focal point (in client coords,
  // e.g. cursor or pinch midpoint) fixed on screen. Centre-relative maths mirrors
  // the `transformOrigin: center` layer.
  const zoomTo = useCallback(
    (nextScaleRaw: number, clientX: number, clientY: number) => {
      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      const t = transformRef.current;
      const nextScale = clamp(nextScaleRaw, MIN_SCALE, MAX_SCALE);
      const ratio = nextScale / t.scale;
      const px = clientX - rect.left - rect.width / 2;
      const py = clientY - rect.top - rect.height / 2;
      const next = { scale: nextScale, x: px - (px - t.x) * ratio, y: py - (py - t.y) * ratio };
      transformRef.current = clampTransform(next, rect.width, rect.height);
      applyTransform();
    },
    [applyTransform],
  );

  // Step zoom from a +/− button, anchored on the frame centre.
  const zoomByStep = useCallback(
    (factor: number) => {
      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      zoomTo(
        transformRef.current.scale * factor,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
    },
    [zoomTo],
  );

  // React's synthetic onWheel is passive, so preventDefault() there is a no-op
  // (page still scrolls). Bind a native non-passive wheel listener instead.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTo(
        transformRef.current.scale * Math.exp(-e.deltaY * ZOOM_SENSITIVITY),
        e.clientX,
        e.clientY,
      );
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      // Second finger down — start a pinch, end any single-finger drag.
      dragRef.current = null;
      const [a, b] = [...pointers.values()];
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: transformRef.current.scale,
      };
    } else if (transformRef.current.scale > MIN_SCALE) {
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origin: transformRef.current,
      };
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const pointers = pointersRef.current;
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Pinch takes precedence over drag when two pointers are down.
      const pinch = pinchRef.current;
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        zoomTo((pinch.scale * dist) / pinch.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }

      const drag = dragRef.current;
      const frame = frameRef.current;
      if (!drag || !frame || drag.pointerId !== e.pointerId) return;
      const rect = frame.getBoundingClientRect();
      const next = {
        scale: drag.origin.scale,
        x: drag.origin.x + (e.clientX - drag.startX),
        y: drag.origin.y + (e.clientY - drag.startY),
      };
      transformRef.current = clampTransform(next, rect.width, rect.height);
      applyTransform();
    },
    [applyTransform, zoomTo],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
      if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
      applyTransform(); // refresh cursor grabbing → grab
    },
    [applyTransform],
  );

  const resetZoom = useCallback(() => {
    transformRef.current = IDENTITY;
    applyTransform();
  }, [applyTransform]);

  // Sample the target image whenever it (or the resolution) changes. Cheap enough
  // to redo, but kept in a ref so an algorithm toggle re-matches without re-sampling.
  useEffect(() => {
    let active = true;
    resetZoom();
    setDims(null);
    // New image invalidates prior sample/tiles/data.
    sampledRef.current = null;
    tileCacheRef.current = new Map();
    dataRef.current = null;
    sampleGrid(image.url, resolution).then((sampled) => {
      if (!active || !sampled) return;
      sampledRef.current = sampled;
      setDims({ cols: sampled.cols, rows: sampled.rows });
      onGrid?.({ cols: sampled.cols, rows: sampled.rows });
    });
    return () => {
      active = false;
    };
  }, [image.url, resolution, onGrid, resetZoom]);

  // Match tiles with the selected algorithm and paint. Re-runs on algorithm/tile
  // change; decoded tiles reset since a new matching yields different cells.
  useEffect(() => {
    let active = true;
    const sampled = sampledRef.current;
    if (!sampled) return;
    const algo = MATCH_OPTIONS.find((o) => o.id === algorithm) ?? MATCH_OPTIONS[0];
    const cells = algo.match(sampled.cells, tiles);
    const { cols, rows } = sampled;
    const data: MosaicData = { cols, rows, cells };
    dataRef.current = data;
    // Keep the decoded-tile cache: the tile set is identical across algorithms,
    // only the cell→tile mapping changes. Dropping it forces a full re-decode and
    // flashes the mosaic back to avg-colour blocks on every toggle.
    // Paint after the canvas mounts with the new aspect ratio.
    requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!active || !canvas || !cells.length) return;
      // Refresh a settled overlay as tiles finish decoding into the cache.
      paintMosaic(canvas, data, tileCacheRef.current, () => !active).then(() => {
        if (active) drawDetail();
      });
    });
    return () => {
      active = false;
    };
  }, [algorithm, tiles, dims, drawDetail]);

  // Cancel any pending frame on unmount. Reset the ref too: without this a
  // StrictMode double-mount leaves rafRef stuck non-null, so every later
  // applyTransform() bails at the guard and the DOM is never updated.
  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    [],
  );

  const cols = dims?.cols ?? resolution;
  const rows = dims?.rows ?? resolution;
  const hasMosaic = dims !== null;

  // Expose the painted mosaic for download/share. Renders a fresh high-resolution
  // export (see renderExport) rather than reading the GPU-capped on-screen canvas,
  // so saved tiles are crisp instead of the ~20px they appear at on screen.
  useImperativeHandle(
    ref,
    () => ({
      toBlob: async () => {
        const data = dataRef.current;
        if (!data || !hasMosaic) return null;
        const canvas = await renderExport(data, tileCacheRef.current);
        return encodeExport(canvas);
      },
      toSvg: async () => {
        const data = dataRef.current;
        if (!data || !hasMosaic) return null;
        return renderSvg(data, tileCacheRef.current);
      },
    }),
    [hasMosaic],
  );

  return (
    <div className="w-full" style={{ maxWidth: 660 }}>
      <div
        ref={frameRef}
        className="relative w-full overflow-hidden rounded-2xl shadow-2xl touch-none select-none"
        style={{
          aspectRatio: `${cols}/${rows}`,
          cursor: 'default',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={resetZoom}
      >
        <div ref={contentRef} className="absolute inset-0" style={{ transformOrigin: 'center' }}>
          {/* One canvas replaces ~40k <img> nodes; painted imperatively in the effect. */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ imageRendering: 'auto', display: hasMosaic ? 'block' : 'none' }}
          />
          {!hasMosaic && (
            // Colours still resolving (or unreadable) — show the target as a placeholder.
            <img
              src={image.url}
              alt={image.label}
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />
          )}
        </div>
        {/* Crisp overlay: visible cells re-rasterized at device res on zoom-settle.
          Not transformed — maps the visible slice straight into frame pixels. */}
        <canvas
          ref={detailRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ opacity: 0, transition: 'opacity 0ms ease-out' }}
        />
        {/* Subtle vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)',
          }}
        />

        {/* Zoom controls */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1 rounded-xl border border-white/10 bg-black/50 p-1 backdrop-blur-sm">
          <ZoomButton label="Zoom in" onClick={() => zoomByStep(ZOOM_STEP)}>
            <IconPlus size={16} />
          </ZoomButton>
          <ZoomButton label="Zoom out" onClick={() => zoomByStep(1 / ZOOM_STEP)}>
            <IconMinus size={16} />
          </ZoomButton>
          <ZoomButton label="Reset zoom" onClick={resetZoom}>
            <IconZoomReset size={16} />
          </ZoomButton>
        </div>
      </div>
    </div>
  );
});

export default MosaicGrid;
