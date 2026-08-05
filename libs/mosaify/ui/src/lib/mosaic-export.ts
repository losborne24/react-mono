import type { MatchedCell, RGB } from './mosaic-match';
import { loadImage, paintCells, type MosaicData, type TileCache } from './mosaic-canvas';

/**
 * Per-tile pixel size for the full-detail exports (raster PNG/JPEG and SVG). Spotify
 * album art is served at 640px (images[0]), so matching that captures the full source
 * detail with no upscaling.
 *
 * For the raster, dense grids clamp down via the dim/area caps in exportCell. The SVG
 * stores each unique cover once and references it per cell, so it never hits a canvas
 * ceiling — every tile stays full-detail regardless of grid density.
 */
const SOURCE_TILE_PX = 640;

/**
 * Hard cap on the longer edge of the exported bitmap. 12288 lets grids up to ~19-res
 * reach the full 640px/tile; the raster tops out ~150MP, encoding in ~5s (extrapolated
 * from the measured 67MP/2.4s at 8192px). A 16k canvas is ~264MP and encodes far slower.
 * The SVG export is the path for full-detail tiles beyond this.
 */
const EXPORT_MAX_DIM = 12288;

/** Safety valve so huge/near-square grids can't allocate a canvas the browser rejects. */
const EXPORT_MAX_AREA = 12288 * 12288;

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
  return Math.max(1, Math.min(SOURCE_TILE_PX, dimCap, areaCap));
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

/** Unique tile covers in first-seen order, each with its average-colour fallback. */
function uniqueTiles(cells: MatchedCell[]): { url: string; rgb: RGB }[] {
  const seen = new Map<string, RGB>();
  for (const c of cells) if (!seen.has(c.url)) seen.set(c.url, c.rgb);
  return [...seen].map(([url, rgb]) => ({ url, rgb }));
}

/**
 * Render the full mosaic to a fresh offscreen canvas at export size (SOURCE_TILE_PX px per
 * tile, capped by EXPORT_MAX_DIM/area) for download/share. Unlike the on-screen base
 * canvas — capped low for GPU memory — this stamps each unique tile at full crispness.
 * Reuses the decoded-tile cache and decodes any stragglers so the saved image never
 * falls back to avg-colour blocks.
 */
async function renderExport(data: MosaicData, cache: TileCache): Promise<HTMLCanvasElement> {
  const cell = exportCell(data.cols, data.rows);
  const canvas = document.createElement('canvas');
  canvas.width = data.cols * cell;
  canvas.height = data.rows * cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  // High-quality resampling when tiles are scaled to the cell size (default is 'low').
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  await paintCells(ctx, data, cell, cache);
  return canvas;
}

/** The mosaic as a JPEG blob — fast at these sizes and opens natively in Photos. */
export async function renderJpeg(data: MosaicData, cache: TileCache): Promise<Blob | null> {
  const canvas = await renderExport(data, cache);
  return canvasToBlob(canvas, 'image/jpeg', EXPORT_JPEG_QUALITY);
}

/**
 * Serialise the mosaic as a self-contained SVG. Each *unique* cover is embedded once
 * in <defs> (as a JPEG data URI) and referenced by a lightweight <use> per cell, so
 * file size scales with the number of unique tiles, not the cell count. Because the
 * tiles are referenced rather than rasterised into one bitmap, every cell stays full
 * detail no matter the grid density — sidestepping the PNG's canvas-size ceiling.
 *
 * Caveat: a viewer still rasterises the whole thing to display it, so very dense grids
 * (e.g. 512²) may be slow or refuse to open at full size — this is an archival artifact.
 */
export async function renderSvg(data: MosaicData, cache: TileCache): Promise<Blob> {
  const { cols, rows, cells } = data;
  const unique = uniqueTiles(cells);
  const idFor = new Map(unique.map((t, i) => [t.url, `t${i.toString(36)}`]));

  // Embed each unique tile once, falling back to its average-colour block on failure.
  const defs: string[] = [];
  for (const { url, rgb } of unique) {
    const id = idFor.get(url);
    const uri = await encodeTile(url, cache, SOURCE_TILE_PX);
    if (uri) {
      defs.push(
        `<image id="${id}" width="${SOURCE_TILE_PX}" height="${SOURCE_TILE_PX}" href="${uri}"/>`,
      );
    } else {
      const [r, g, b] = rgb;
      defs.push(
        `<rect id="${id}" width="${SOURCE_TILE_PX}" height="${SOURCE_TILE_PX}" fill="rgb(${r},${g},${b})"/>`,
      );
    }
  }

  // One positioned <use> per cell — the bulk of the file, but only ~30 bytes each.
  const uses = new Array<string>(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const x = (i % cols) * SOURCE_TILE_PX;
    const y = Math.floor(i / cols) * SOURCE_TILE_PX;
    uses[i] = `<use href="#${idFor.get(cells[i].url)}" x="${x}" y="${y}"/>`;
  }

  const w = cols * SOURCE_TILE_PX;
  const h = rows * SOURCE_TILE_PX;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>${defs.join('')}</defs>${uses.join('')}</svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
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
export async function renderPdf(data: MosaicData, cache: TileCache): Promise<Blob> {
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
  const unique = uniqueTiles(cells);
  const uidFor = new Map(unique.map((t, i) => [t.url, i]));

  // Encode each unique cover in parallel; a null slot means we draw its avg-colour block.
  const jpegs = await mapPool(unique, PDF_ENCODE_CONCURRENCY, (t) =>
    encodeTileBytes(t.url, cache, tilePx),
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
      const [r, g, b] = unique[ui].rgb;
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
