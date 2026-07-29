import type { SourceImage } from '@react-mono/models';
import { runMatch, type MatchedCell, type RGB } from './mosaic-match';

/**
 * Runs cell→tile matching off the main thread. The match is O(cells × tiles) and, for the
 * "Best" (ΔE2000) metric especially, would freeze the UI if run inline — so the component
 * posts the sampled grid + tiles here and paints the result when it comes back.
 */

export interface MatchRequest {
  /** Monotonic id echoed back so the caller can drop responses from superseded matches. */
  id: number;
  algorithm: string;
  grid: RGB[];
  tiles: SourceImage[];
  /** Sampled grid's row width, so 2D-aware strategies can read a cell's neighbours. */
  cols: number;
}

export interface MatchResponse {
  id: number;
  cells: MatchedCell[];
}

self.onmessage = (e: MessageEvent<MatchRequest>) => {
  const { id, algorithm, grid, tiles, cols } = e.data;
  const cells = runMatch(algorithm, grid, tiles, cols);
  (self as unknown as Worker).postMessage({ id, cells } satisfies MatchResponse);
};
