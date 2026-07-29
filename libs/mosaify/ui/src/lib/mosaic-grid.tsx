import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { IconPlus, IconMinus, IconZoomReset, IconLoader2 } from '@tabler/icons-react';
import type { SourceImage } from '@react-mono/models';
import { DEFAULT_MATCH_ALGORITHM, runMatch, type MatchedCell, type RGB } from './mosaic-match';
import type { MatchRequest, MatchResponse } from './mosaic-match.worker';

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

/**
 * Target px per exported tile. Spotify album art is served at 640px (images[0]), so
 * up to ~640 is real detail, not upscaling. 512 captures most of it while staying
 * comfortably under EXPORT_MAX_DIM for typical grids; dense grids clamp down via the
 * dim/area caps in exportCell.
 */
const EXPORT_CELL = 512;
/**
 * Hard cap on the longer edge of the exported bitmap. 12288 lets a default ~22-res grid
 * reach the full 512px/tile; the raster tops out ~150MP, encoding in ~5s (extrapolated
 * from the measured 67MP/2.4s at 8192px). A 16k canvas is ~264MP and encodes far slower.
 * The SVG export is the path for full-detail tiles beyond this.
 */
const EXPORT_MAX_DIM = 12288;

/** Safety valve so huge/near-square grids can't allocate a canvas the browser rejects. */
const EXPORT_MAX_AREA = 12288 * 12288;

/**
 * Per-tile pixel size for the SVG export. Unlike the PNG, the SVG stores each unique
 * cover once and references it per cell, so this size never hits a canvas ceiling —
 * every tile is full-detail regardless of how many tiles the grid has. 512 matches the
 * raster's per-tile target and stays within Spotify's 640px source art (real detail,
 * not upscaling); cost scales with the unique-track count, not the cell count.
 */
const SVG_TILE_PX = 512;

/** JPEG quality for tiles embedded in the SVG/PDF — balances crispness against file size. */
const SVG_TILE_QUALITY = 0.82;

/**
 * Upper bound on per-tile pixel size for the PDF export. Like the SVG, the PDF embeds
 * each unique cover once (as a JPEG image XObject) and references it per cell, so per-tile
 * detail is independent of grid density and never hits a canvas ceiling. The actual size
 * is derived per-render from the cell's physical size (see PDF_TARGET_DPI) and only
 * reaches this cap for sparse grids with large tiles.
 */
const PDF_TILE_PX = 256;

/**
 * Print resolution the embedded covers target. A tile spanning `cellPt` points needs only
 * `cellPt/72 * DPI` px to hit this DPI, so dense grids (tiny tiles) embed far smaller
 * JPEGs than the 256px cap — cutting encode time, viewer decode time, and file size with
 * no visible loss at print size. 300 is the print standard; raise it for more on-screen
 * zoom detail at the cost of a heavier file.
 */
const PDF_TARGET_DPI = 300;

/** Floor on the derived tile px, so even the tiniest cells keep a legible cover. */
const PDF_MIN_TILE_PX = 96;

/** Max unique covers encoded to JPEG concurrently during a PDF export. */
const PDF_ENCODE_CONCURRENCY = 8;

/**
 * Largest page edge (PDF points, 1pt = 1/72") we'll emit. The classic PDF limit is
 * 14400pt (200"); staying under it keeps every viewer happy. Cell size derives from
 * this cap; the embedded images stay full-res regardless.
 */
const PDF_MAX_PAGE_PT = 14400;

/** Cap a cell at 1 inch so sparse grids don't produce an absurdly large page. */
const PDF_MAX_CELL_PT = 72;

/**
 * Quality for the flat raster JPEG export. Kept below 0.9 so Chrome uses 4:2:0 chroma
 * subsampling (it switches to bulkier 4:4:4 at ≥0.9).
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
   * 512px per tile at any density. `null` if the mosaic isn't painted yet.
   */
  toSvg: () => Promise<Blob | null>;
  /**
   * The mosaic as a print-ready PDF that embeds each unique cover once (sized to the
   * cell's print DPI) and references it per cell. `null` if not painted yet.
   */
  toPdf: () => Promise<Blob | null>;
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

/**
 * Re-exported from `mosaic-match.ts` so the public API (consumed by the feature lib's
 * toggle) is unchanged; the matching logic itself now lives there so it can run inside
 * `mosaic-match.worker.ts` off the main thread.
 */
export type { MatchAlgorithmOption } from './mosaic-match';
export { MATCH_ALGORITHMS } from './mosaic-match';
export { DEFAULT_MATCH_ALGORITHM };

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

/** Decode a tile and draw it onto a fresh `size`px square canvas (or null on failure). */
async function drawTile(
  url: string,
  cache: TileCache,
  size: number,
): Promise<HTMLCanvasElement | null> {
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
  return canvas;
}

/** Decode a tile, draw it to a `size`px square, and return a JPEG data URI (or null). */
async function encodeTile(url: string, cache: TileCache, size: number): Promise<string | null> {
  const canvas = await drawTile(url, cache, size);
  return canvas ? canvas.toDataURL('image/jpeg', SVG_TILE_QUALITY) : null;
}

/** Decode a tile to a `size`px JPEG's raw bytes, for embedding in the PDF (or null). */
async function encodeTileBytes(
  url: string,
  cache: TileCache,
  size: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const canvas = await drawTile(url, cache, size);
  if (!canvas) return null;
  const blob = await canvasToBlob(canvas, 'image/jpeg', SVG_TILE_QUALITY);
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

/**
 * Zlib-deflate `bytes` for a PDF FlateDecode stream, using the platform
 * CompressionStream. Returns `null` when it's unavailable so the caller can fall
 * back to an uncompressed stream.
 */
async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/** Run `task` over `items` with at most `limit` in flight; results keep input order. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Serialise the mosaic as a PDF. Each *unique* cover is embedded once as a JPEG
 * image XObject and drawn per cell from a single content stream, so — like the SVG —
 * file size scales with the unique-track count, not the cell count, and every tile keeps
 * full detail at any density. Cells that fail to decode fall back to an avg-colour rect.
 *
 * The page is sized in points (kept under PDF_MAX_PAGE_PT) and each cover is embedded at
 * just the px its cell needs for PDF_TARGET_DPI, so effective resolution stays at print
 * DPI without over-encoding. Unlike the SVG, PDF viewers and print pipelines handle these
 * large pages gracefully.
 */
async function renderPdf(data: MosaicData, cache: TileCache): Promise<Blob> {
  const { cols, rows, cells } = data;
  const cellPt = Math.max(
    1,
    Math.min(PDF_MAX_CELL_PT, Math.floor(PDF_MAX_PAGE_PT / Math.max(cols, rows))),
  );
  const pageW = cols * cellPt;
  const pageH = rows * cellPt;

  // Embed covers only as large as this cell's print size needs — dense grids (tiny cells)
  // get much smaller JPEGs than the cap, so viewers decode far less on open.
  const tilePx = Math.min(
    PDF_TILE_PX,
    Math.max(PDF_MIN_TILE_PX, Math.round((cellPt / 72) * PDF_TARGET_DPI)),
  );

  // Unique covers in first-seen order → embedded once each; keep the avg-colour fallback.
  const uidFor = new Map<string, number>();
  const rgbFor: RGB[] = [];
  for (const c of cells) {
    if (uidFor.has(c.url)) continue;
    uidFor.set(c.url, uidFor.size);
    rgbFor.push(c.rgb);
  }

  // Encode each unique cover in parallel; a null slot means we draw its avg-colour block.
  const jpegs = await mapPool([...uidFor.keys()], PDF_ENCODE_CONCURRENCY, (url) =>
    encodeTileBytes(url, cache, tilePx),
  );

  // Objects: 1 catalog, 2 pages, 3 page, then one per encoded cover, then the content.
  const imageObj = new Map<number, number>(); // unique index → PDF object number
  let nextObj = 4;
  jpegs.forEach((bytes, ui) => {
    if (bytes) imageObj.set(ui, nextObj++);
  });
  const contentObj = nextObj++;
  const objCount = nextObj - 1;

  // Content stream: place each cell. PDF's origin is bottom-left, so flip rows.
  const ops: string[] = new Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const x = (i % cols) * cellPt;
    const y = pageH - (Math.floor(i / cols) + 1) * cellPt;
    const ui = uidFor.get(cells[i].url) as number;
    if (imageObj.has(ui)) {
      ops[i] = `q ${cellPt} 0 0 ${cellPt} ${x} ${y} cm /Im${ui} Do Q`;
    } else {
      const [r, g, b] = rgbFor[ui];
      const c = (v: number) => (v / 255).toFixed(3);
      ops[i] = `q ${c(r)} ${c(g)} ${c(b)} rg ${x} ${y} ${cellPt} ${cellPt} re f Q`;
    }
  }
  const rawContent = new TextEncoder().encode(ops.join('\n'));
  const packed = await deflate(rawContent);
  const contentBytes = packed ?? rawContent;

  // Assemble the file as bytes (image streams are binary), tracking object offsets.
  const enc = new TextEncoder();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const offsets = new Array<number>(objCount + 1).fill(0); // 1-indexed by object number
  let offset = 0;
  const put = (bytes: Uint8Array<ArrayBuffer>) => {
    parts.push(bytes);
    offset += bytes.length;
  };
  const putStr = (s: string) => put(enc.encode(s));
  const startObj = (n: number) => {
    offsets[n] = offset;
  };

  putStr('%PDF-1.5\n');
  put(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker

  startObj(1);
  putStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObj(2);
  putStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  let xobjRes = '';
  imageObj.forEach((objNum, ui) => {
    xobjRes += `/Im${ui} ${objNum} 0 R `;
  });
  startObj(3);
  putStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
      `/Resources << /XObject << ${xobjRes}>> >> /Contents ${contentObj} 0 R >>\nendobj\n`,
  );

  jpegs.forEach((bytes, ui) => {
    if (!bytes) return;
    const objNum = imageObj.get(ui) as number;
    startObj(objNum);
    putStr(
      `${objNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${tilePx} ` +
        `/Height ${tilePx} /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
        `/Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,
    );
    put(bytes);
    putStr('\nendstream\nendobj\n');
  });

  startObj(contentObj);
  const filter = packed ? ' /Filter /FlateDecode' : '';
  putStr(`${contentObj} 0 obj\n<<${filter} /Length ${contentBytes.length} >>\nstream\n`);
  put(contentBytes);
  putStr('\nendstream\nendobj\n');

  const xrefAt = offset;
  let xref = `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= objCount; n++) {
    xref += `${offsets[n].toString().padStart(10, '0')} 00000 n \n`;
  }
  putStr(xref);
  putStr(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  return new Blob(parts, { type: 'application/pdf' });
}

/**
 * Serialise the mosaic as a self-contained SVG. Each *unique* cover is embedded once
 * in <defs> (as a 512px JPEG data URI) and referenced by a lightweight <use> per cell,
 * so file size scales with the number of unique tiles, not the cell count. Because the
 * tiles are referenced rather than rasterised into one bitmap, every cell stays full
 * 512px detail no matter the grid density — sidestepping the PNG's canvas-size ceiling.
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
  // True while the worker is computing a match, to show a spinner over the canvas.
  const [matching, setMatching] = useState(false);
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
  // Web Worker running the O(cells × tiles) match off the main thread so selecting a
  // heavy metric (notably "Best"/ΔE2000) can't freeze the UI. Lazily created; stays null
  // where Worker isn't available (jsdom/SSR), where we fall back to a synchronous match.
  const matchWorkerRef = useRef<Worker | null>(null);
  // Monotonic id per match request; a response whose id isn't the latest is dropped, so
  // rapid algorithm toggles always settle on the last-selected one.
  const matchReqIdRef = useRef(0);
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

  // Lazily spin up the match worker. Returns null where Worker is unavailable (jsdom/SSR)
  // or construction throws, so the caller falls back to a synchronous match.
  const getMatchWorker = useCallback((): Worker | null => {
    if (matchWorkerRef.current) return matchWorkerRef.current;
    if (typeof Worker === 'undefined') return null;
    try {
      matchWorkerRef.current = new Worker(
        new URL('./mosaic-match.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      return null;
    }
    return matchWorkerRef.current;
  }, []);

  // Match tiles with the selected algorithm and paint. Re-runs on algorithm/tile change;
  // decoded tiles reset since a new matching yields different cells. The match runs in a
  // worker so a heavy metric can't block the main thread; the previous mosaic stays
  // painted until the result arrives.
  useEffect(() => {
    const sampled = sampledRef.current;
    if (!sampled) return;
    let active = true;
    const { cols, rows } = sampled;

    // Keep the decoded-tile cache: the tile set is identical across algorithms, only the
    // cell→tile mapping changes. Dropping it forces a full re-decode and flashes the
    // mosaic back to avg-colour blocks on every toggle.
    const paint = (cells: MatchedCell[]) => {
      if (!active) return;
      const data: MosaicData = { cols, rows, cells };
      dataRef.current = data;
      // Paint after the canvas mounts with the new aspect ratio.
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!active || !canvas || !cells.length) return;
        // Refresh a settled overlay as tiles finish decoding into the cache.
        paintMosaic(canvas, data, tileCacheRef.current, () => !active).then(() => {
          if (active) drawDetail();
        });
      });
    };

    const reqId = ++matchReqIdRef.current;
    const worker = getMatchWorker();
    if (worker) {
      const onMessage = (e: MessageEvent<MatchResponse>) => {
        // Ignore responses from superseded matches (rapid toggles).
        if (e.data.id !== matchReqIdRef.current) return;
        setMatching(false);
        paint(e.data.cells);
      };
      worker.addEventListener('message', onMessage);
      setMatching(true);
      worker.postMessage({
        id: reqId,
        algorithm,
        grid: sampled.cells,
        tiles,
        cols,
      } satisfies MatchRequest);
      return () => {
        active = false;
        worker.removeEventListener('message', onMessage);
      };
    }

    // No Worker available: match synchronously.
    paint(runMatch(algorithm, sampled.cells, tiles, cols));
    return () => {
      active = false;
    };
  }, [algorithm, tiles, dims, drawDetail, getMatchWorker]);

  // Cancel any pending frame on unmount. Reset the ref too: without this a
  // StrictMode double-mount leaves rafRef stuck non-null, so every later
  // applyTransform() bails at the guard and the DOM is never updated.
  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      matchWorkerRef.current?.terminate();
      matchWorkerRef.current = null;
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
      toPdf: async () => {
        const data = dataRef.current;
        if (!data || !hasMosaic) return null;
        return renderPdf(data, tileCacheRef.current);
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

        {/* Processing spinner — shown while the worker computes the tile match. */}
        {matching && (
          <div className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/80 backdrop-blur-sm pointer-events-none">
            <IconLoader2 size={16} className="animate-spin" />
          </div>
        )}

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
