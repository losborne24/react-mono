import type { MatchedCell, RGB } from './mosaic-match';

/**
 * Largest edge (px) of the backing canvas. The mosaic is one <canvas> instead of
 * ~40k <img> nodes, so the only crispness knob is the bitmap resolution: bigger =
 * sharper when zoomed, but more GPU memory. 4096 stays within every browser's max
 * texture size and keeps tiles legible well into the zoom range.
 */
const MAX_CANVAS_DIMENSION = 4096;

/**
 * Max visible cells for a live per-frame detail redraw. Above this the drawImage
 * cost per frame risks dropping below 60fps, so the overlay is hidden and the base
 * canvas shows instead (only happens at low zoom, where the base is already ~1:1).
 */
export const DETAIL_MAX_CELLS = 2500;

export interface Transform {
  scale: number;
  x: number;
  y: number;
}

export interface SampledGrid {
  cols: number;
  rows: number;
  cells: RGB[];
}

export interface MosaicData {
  cols: number;
  rows: number;
  cells: MatchedCell[];
}

/** Decoded tiles, keyed by URL, shared between the base paint and detail redraws. */
export type TileCache = Map<string, HTMLImageElement>;

/**
 * Sample the target image into a grid of average pixel colours by drawing it
 * downscaled onto a canvas — one cell per slot. The grid is sized to `resolution`
 * tiles on the image's longer edge, with the shorter edge derived from its aspect
 * ratio so the mosaic isn't stretched.
 *
 * Best-effort: a CORS-tainted canvas or load failure resolves to `null`.
 */
export function sampleGrid(url: string, resolution: number): Promise<SampledGrid | null> {
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

/** Load an image for canvas drawing, or `null` on failure/taint. */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Group cell indices by tile URL so each image is decoded once, not once per cell. */
export function groupByUrl(cells: MatchedCell[]): Map<string, number[]> {
  const byUrl = new Map<string, number[]>();
  for (let i = 0; i < cells.length; i++) {
    const list = byUrl.get(cells[i].url);
    if (list) list.push(i);
    else byUrl.set(cells[i].url, [i]);
  }
  return byUrl;
}

/**
 * Shared two-pass paint used by both the on-screen base canvas and the high-res
 * export:
 *  1. Fill every cell with its matched tile's average colour — instant, no I/O.
 *  2. Decode each *unique* tile once (there are far fewer unique tiles than cells)
 *     and draw it into all of its cells. Progressive: tiles appear as they decode.
 *
 * Decoded tiles land in `cache` for reuse (detail redraw / export). `isStale`, when
 * given, lets the caller abort mid-decode (image swap / unmount).
 */
export async function paintCells(
  ctx: CanvasRenderingContext2D,
  data: MosaicData,
  cell: number,
  cache: TileCache,
  isStale?: () => boolean,
): Promise<void> {
  const { cols, cells } = data;

  // Pass 1: average-colour blocks, so any tile that fails to decode still fills.
  for (let i = 0; i < cells.length; i++) {
    const [r, g, b] = cells[i].rgb;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect((i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
  }

  // Pass 2: decode each unique tile and stamp it into all its cells. Reuse an
  // already-decoded tile (e.g. after an algorithm toggle) instead of re-fetching —
  // avoids the avg-colour flash while identical bytes re-decode.
  for (const [url, indices] of groupByUrl(cells)) {
    if (isStale?.()) return;
    let img = cache.get(url) ?? null;
    if (!img) {
      img = await loadImage(url);
      if (isStale?.()) return;
      if (!img) continue; // keep the avg-colour block for this tile
      cache.set(url, img);
    }
    for (const i of indices) {
      ctx.drawImage(img, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
    }
  }
}

/**
 * Paint the mosaic onto a single canvas instead of mounting ~40k <img> nodes. The
 * backing store is sized so the longer edge hits MAX_CANVAS_DIMENSION and cells stay
 * square. See paintCells for the two-pass fill/stamp strategy.
 */
export async function paintMosaic(
  canvas: HTMLCanvasElement,
  data: MosaicData,
  cache: TileCache,
  isStale: () => boolean,
): Promise<void> {
  const cell = Math.max(1, Math.floor(MAX_CANVAS_DIMENSION / Math.max(data.cols, data.rows)));
  canvas.width = data.cols * cell;
  canvas.height = data.rows * cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  await paintCells(ctx, data, cell, cache, isStale);
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
export function paintDetail(
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
