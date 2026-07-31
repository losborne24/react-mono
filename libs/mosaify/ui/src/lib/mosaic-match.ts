import type { SourceImage } from '@react-mono/models';

/**
 * Framework-free tile-matching core. Kept separate from `mosaic-grid.tsx` so it can run
 * inside a Web Worker (see `mosaic-match.worker.ts`) without pulling in React/DOM — the
 * match is O(cells × tiles) and would otherwise freeze the UI on the main thread.
 */

export type RGB = [number, number, number];

/** CIELAB colour — perceptually uniform, so euclidean distance ≈ perceived difference. */
export type Lab = [number, number, number];

export interface MatchedCell {
  url: string;
  /** Matched tile's average colour — painted immediately while art decodes. */
  rgb: RGB;
}

/** Parse a `rgb(r, g, b)` string into a tuple, or `null` if it can't. */
export function parseRgb(color: string | undefined): RGB | null {
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

/**
 * Squared euclidean distance between two Lab colours — the ΔE76 metric. Cheap and a
 * solid perceptual match; it just slightly overweights differences in saturated colours.
 */
function labDist2(a: Lab, b: Lab): number {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

const DEG = Math.PI / 180;
/** 25^7, a constant in the CIEDE2000 chroma weighting. */
const POW25_7 = 6103515625;

/**
 * CIEDE2000 (ΔE2000) colour difference between two Lab colours — the most perceptually
 * accurate of the common metrics, correcting ΔE76's known weaknesses in the blue and
 * neutral regions. Costlier than {@link labDist2} (trig per comparison), so it backs the
 * "Best" mode rather than the default. Returns ΔE directly (not squared);
 * nearest-tile comparisons only need relative ordering, so kL=kC=kH=1.
 */
function deltaE2000(a: Lab, b: Lab): number {
  const [L1, a1, b1] = a;
  const [L2, a2, b2] = b;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const avgC = (C1 + C2) / 2;
  const avgC7 = avgC ** 7;
  const g = 0.5 * (1 - Math.sqrt(avgC7 / (avgC7 + POW25_7)));
  const a1p = a1 * (1 + g);
  const a2p = a2 * (1 + g);
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const avgCp = (C1p + C2p) / 2;

  const h1p = (Math.atan2(b1, a1p) / DEG + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) / DEG + 360) % 360;

  const avgLp = (L1 + L2) / 2;
  const avgHp = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + 360) / 2 : (h1p + h2p) / 2;

  const t =
    1 -
    0.17 * Math.cos((avgHp - 30) * DEG) +
    0.24 * Math.cos(2 * avgHp * DEG) +
    0.32 * Math.cos((3 * avgHp + 6) * DEG) -
    0.2 * Math.cos((4 * avgHp - 63) * DEG);

  let dhp = h2p - h1p;
  if (dhp > 180) dhp -= 360;
  else if (dhp < -180) dhp += 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * DEG);

  const sL = 1 + (0.015 * (avgLp - 50) ** 2) / Math.sqrt(20 + (avgLp - 50) ** 2);
  const sC = 1 + 0.045 * avgCp;
  const sH = 1 + 0.015 * avgCp * t;

  const dTheta = 30 * Math.exp(-(((avgHp - 275) / 25) ** 2));
  const avgCp7 = avgCp ** 7;
  const rC = 2 * Math.sqrt(avgCp7 / (avgCp7 + POW25_7));
  const rT = -rC * Math.sin(2 * dTheta * DEG);

  const lTerm = dLp / sL;
  const cTerm = dCp / sC;
  const hTerm = dHp / sH;
  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rT * cTerm * hTerm);
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

/** Nearest tile in CIELAB space by ΔE76 — matches how the eye judges colour difference. */
function matchDeltaE76(grid: RGB[], tiles: SourceImage[]): MatchedCell[] {
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

/** ΔE76 squared distance with an adjustable weight on the luminance (L*) term. */
function weightedLabDist2(a: Lab, b: Lab, wL: number): number {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return wL * dl * dl + da * da + db * db;
}

/**
 * Sobel gradient magnitude per cell, over the grid's luminance (Lab L*). Cells sit on a
 * `cols`-wide row-major grid; out-of-bounds samples replicate the edge cell. Magnitudes
 * are normalised to 0–1 by the grid's peak gradient, so they scale a per-cell weight
 * independent of the image's absolute contrast.
 */
function sobelEdges(lum: number[], cols: number): number[] {
  const rows = Math.ceil(lum.length / cols);
  const at = (x: number, y: number): number => {
    const cx = x < 0 ? 0 : x >= cols ? cols - 1 : x;
    const cy = y < 0 ? 0 : y >= rows ? rows - 1 : y;
    return lum[cy * cols + cx];
  };
  const mag = new Array<number>(lum.length);
  let max = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tl = at(x - 1, y - 1);
      const tc = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const ml = at(x - 1, y);
      const mr = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const bc = at(x, y + 1);
      const br = at(x + 1, y + 1);
      const gx = tr + 2 * mr + br - tl - 2 * ml - bl;
      const gy = bl + 2 * bc + br - tl - 2 * tc - tr;
      const m = Math.hypot(gx, gy);
      mag[y * cols + x] = m;
      if (m > max) max = m;
    }
  }
  if (max > 0) {
    for (let i = 0; i < mag.length; i++) mag[i] /= max;
  }
  return mag;
}

/** Extra weight on the ΔE76 luminance term at full edge strength (0 ⇒ plain ΔE76). */
const EDGE_LUMA_BOOST = 3;

/**
 * Perceptual (ΔE76) match with Sobel edge weighting. A Sobel pass over the grid's
 * luminance flags edge cells — outlines and high-contrast detail — and at those cells the
 * luminance term of the ΔE76 distance is boosted, so the chosen tile tracks the edge's
 * brightness tightly and the outline survives. Flat cells fall back to plain ΔE76, leaving
 * overall colour accuracy unchanged.
 */
function matchDetail(grid: RGB[], tiles: SourceImage[], cols: number): MatchedCell[] {
  const swatches = toSwatches(tiles);
  if (!swatches.length) return [];
  const cellLabs = grid.map(rgbToLab);
  const edges = sobelEdges(
    cellLabs.map((lab) => lab[0]),
    Math.max(1, cols),
  );
  return cellLabs.map((cellLab, idx) => {
    const wL = 1 + EDGE_LUMA_BOOST * edges[idx];
    let best = swatches[0];
    let bestDist = weightedLabDist2(cellLab, best.lab, wL);
    for (let i = 1; i < swatches.length; i++) {
      const d = weightedLabDist2(cellLab, swatches[i].lab, wL);
      if (d < bestDist) {
        best = swatches[i];
        bestDist = d;
      }
    }
    return { url: best.url, rgb: best.rgb };
  });
}

/** Side length, in cells, of the coarse pooling block for the multi-scale pass. */
const MULTISCALE_BLOCK = 4;
/** Weight on the coarse-scale ΔE76 term relative to the per-cell term (0 ⇒ plain ΔE76). */
const MULTISCALE_COARSE_WEIGHT = 0.5;

/**
 * Average-pool the grid's Lab colours into `block`×`block` cell blocks, then expand back so
 * every cell carries the mean colour of its block — a single coarse level of an image
 * pyramid. Cells lie on a `cols`-wide row-major grid; partial blocks at the right/bottom
 * edges just average the cells they contain.
 */
function coarseLabs(cellLabs: Lab[], cols: number, block: number): Lab[] {
  const rows = Math.ceil(cellLabs.length / cols);
  const out = new Array<Lab>(cellLabs.length);
  for (let by = 0; by < rows; by += block) {
    for (let bx = 0; bx < cols; bx += block) {
      const yEnd = Math.min(by + block, rows);
      const xEnd = Math.min(bx + block, cols);
      let l = 0;
      let a = 0;
      let b = 0;
      let n = 0;
      for (let y = by; y < yEnd; y++) {
        for (let x = bx; x < xEnd; x++) {
          const idx = y * cols + x;
          if (idx >= cellLabs.length) continue;
          const lab = cellLabs[idx];
          l += lab[0];
          a += lab[1];
          b += lab[2];
          n++;
        }
      }
      if (!n) continue;
      const mean: Lab = [l / n, a / n, b / n];
      for (let y = by; y < yEnd; y++) {
        for (let x = bx; x < xEnd; x++) {
          const idx = y * cols + x;
          if (idx < cellLabs.length) out[idx] = mean;
        }
      }
    }
  }
  return out;
}

/**
 * Multi-scale perceptual match. Alongside each cell's own ΔE76 distance it adds a weighted
 * ΔE76 to the cell's coarse (block-averaged) colour, so a chosen tile must fit both the fine
 * cell and the larger region it sits in. Neighbouring tiles then cohere across a region,
 * keeping big shapes and overall composition legible where a purely per-cell match fragments
 * them.
 */
function matchMultiScale(grid: RGB[], tiles: SourceImage[], cols: number): MatchedCell[] {
  const swatches = toSwatches(tiles);
  if (!swatches.length) return [];
  const cellLabs = grid.map(rgbToLab);
  const coarse = coarseLabs(cellLabs, Math.max(1, cols), MULTISCALE_BLOCK);
  return cellLabs.map((cellLab, idx) => {
    const coarseLab = coarse[idx];
    let best = swatches[0];
    let bestDist =
      labDist2(cellLab, best.lab) + MULTISCALE_COARSE_WEIGHT * labDist2(coarseLab, best.lab);
    for (let i = 1; i < swatches.length; i++) {
      const d =
        labDist2(cellLab, swatches[i].lab) +
        MULTISCALE_COARSE_WEIGHT * labDist2(coarseLab, swatches[i].lab);
      if (d < bestDist) {
        best = swatches[i];
        bestDist = d;
      }
    }
    return { url: best.url, rgb: best.rgb };
  });
}

/** Nearest tile by CIEDE2000 — the most perceptually accurate metric, but the slowest. */
function matchDeltaE2000(grid: RGB[], tiles: SourceImage[]): MatchedCell[] {
  const swatches = toSwatches(tiles);
  if (!swatches.length) return [];
  return grid.map((cell) => {
    const cellLab = rgbToLab(cell);
    let best = swatches[0];
    let bestDist = deltaE2000(cellLab, best.lab);
    for (let i = 1; i < swatches.length; i++) {
      const d = deltaE2000(cellLab, swatches[i].lab);
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

/**
 * A cell→tile matching strategy. `cols` gives the grid's row width so 2D-aware strategies
 * (e.g. {@link matchDetail}'s Sobel pass) can read a cell's neighbours; strategies that
 * work per-cell simply ignore it. More can be added; the toggle switches between them.
 */
type MatchAlgorithm = (grid: RGB[], tiles: SourceImage[], cols: number) => MatchedCell[];

interface MatchOption {
  id: string;
  label: string;
  /** Short name of the underlying colour-difference metric, for the footnote lead-in. */
  term: string;
  description: string;
  match: MatchAlgorithm;
}

/** Available matching methodologies, in toggle order. */
const MATCH_OPTIONS = [
  {
    id: 'fast',
    label: 'Fast',
    term: 'RGB (Euclidean Distance)',
    description:
      'Matches tiles by comparing raw RGB colour values. Fastest methodology, but least representative of human colour perception.',
    match: matchNearestRgb,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    term: 'ΔE76 (CIELAB)',
    description:
      'Matches tiles using perceptual colour difference in the CIELAB colour space. Offers a good balance between processing speed and visual accuracy.',
    match: matchDeltaE76,
  },
  {
    id: 'detail',
    label: 'Detail',
    term: 'ΔE76 (CIELAB) with Sobel edge weighting',
    description:
      'Combines perceptual colour matching with Sobel edge detection to better preserve outlines, contrast and fine details while maintaining accurate colours.',
    match: matchDetail,
  },
  {
    id: 'accurate',
    label: 'Accurate',
    term: 'ΔE2000 (CIEDE2000)',
    description:
      'Matches tiles using the CIEDE2000 perceptual colour difference formula. Produces the most faithful colour matching, but requires more processing.',
    match: matchDeltaE2000,
  },
  {
    id: 'structure',
    label: 'Structure',
    term: 'ΔE76 (CIELAB) with multi-scale',
    description:
      'Uses ΔE76 (CIELAB) perceptual colour matching across multiple image scales to preserve larger shapes, composition and important visual structures.',
    match: matchMultiScale,
  },
  {
    id: 'variety',
    label: 'Variety',
    term: 'ΔE76 (CIELAB) with reuse penalty',
    description:
      'Uses perceptual colour matching while reducing repeated tile usage. Creates a more evenly distributed mosaic without significantly affecting colour accuracy.',
    match: matchVariety,
  },
] as const satisfies readonly MatchOption[];

/** Union of valid matching-algorithm ids, derived from {@link MATCH_OPTIONS}. */
export type MatchAlgorithmId = (typeof MATCH_OPTIONS)[number]['id'];

/** Public metadata for the matching algorithms, for a parent-rendered toggle + footnote. */
export interface MatchAlgorithmOption {
  id: MatchAlgorithmId;
  label: string;
  /** Short name of the underlying colour-difference metric, for the footnote lead-in. */
  term: string;
  description: string;
}

/** Selectable algorithms (id + label + term + description), in toggle order. */
export const MATCH_ALGORITHMS: MatchAlgorithmOption[] = MATCH_OPTIONS.map(
  ({ id, label, term, description }) => ({ id, label, term, description }),
);

/** Default matching mode id — Balanced (Lab + ΔE76). */
export const DEFAULT_MATCH_ALGORITHM: MatchAlgorithmId =
  MATCH_OPTIONS.find((o) => o.id === 'balanced')?.id ?? MATCH_OPTIONS[0].id;

/**
 * Run a matching strategy by id, falling back to the first option for an unknown id.
 * `cols` is the sampled grid's row width, needed by 2D-aware strategies (see
 * {@link MatchAlgorithm}).
 */
export function runMatch(
  algorithm: string,
  grid: RGB[],
  tiles: SourceImage[],
  cols: number,
): MatchedCell[] {
  const algo = MATCH_OPTIONS.find((o) => o.id === algorithm) ?? MATCH_OPTIONS[0];
  return algo.match(grid, tiles, cols);
}
