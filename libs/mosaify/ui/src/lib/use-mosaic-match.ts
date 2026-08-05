import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { SourceImage } from '@react-mono/models';
import { runMatch, type MatchAlgorithmId, type MatchedCell } from './mosaic-match';
import type { MatchRequest, MatchResponse } from './mosaic-match.worker';
import {
  paintMosaic,
  sampleGrid,
  type MosaicData,
  type SampledGrid,
  type TileCache,
} from './mosaic-canvas';

export interface UseMosaicMatchOptions {
  image: SourceImage;
  /** Album/playlist artwork used as mosaic tiles. Each carries an average `color`. */
  tiles: SourceImage[];
  /** Tile count along the image's longer edge; the shorter edge follows its aspect. */
  resolution: number;
  /** Selected matching-algorithm id. */
  algorithm: MatchAlgorithmId;
  /** Reports the derived grid once the image aspect is known (for stats/labels). */
  onGrid?: (grid: { cols: number; rows: number }) => void;
  /** Called when a new image starts sampling, so the view can drop any pan/zoom. */
  resetZoom: () => void;
  /** Called once a paint settles, so a crisp overlay can be redrawn. */
  onPainted: () => void;
}

export interface UseMosaicMatch {
  /** Derived grid, or `null` until the image aspect is known. */
  dimensions: { cols: number; rows: number } | null;
  /** True while the worker is computing a match, to show a spinner over the canvas. */
  matching: boolean;
  /** Attach to the on-screen canvas the mosaic is painted into. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Latest painted mosaic data (for exports / overlay redraws). */
  dataRef: RefObject<MosaicData | null>;
  /** Decoded-tile cache, kept across algorithm toggles to avoid re-decoding. */
  tileCacheRef: RefObject<TileCache>;
}

/**
 * Samples the target image, matches each cell to its nearest tile (in a Web Worker when
 * available, else synchronously), and paints the result into a canvas. Keeps the sampled
 * grid and decoded-tile cache in refs so an algorithm toggle re-matches without
 * re-sampling or re-decoding.
 */
export function useMosaicMatch({
  image,
  tiles,
  resolution,
  algorithm,
  onGrid,
  resetZoom,
  onPainted,
}: UseMosaicMatchOptions): UseMosaicMatch {
  const [dimensions, setDimensions] = useState<{ cols: number; rows: number } | null>(null);
  const [matching, setMatching] = useState(false);
  // Sampled target grid for the current image, reused when only the algorithm changes.
  const sampledRef = useRef<SampledGrid | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Decoded tiles + mosaic data kept for detail redraws / exports without re-decoding.
  const tileCacheRef = useRef<TileCache>(new Map());
  const dataRef = useRef<MosaicData | null>(null);
  // Web Worker running the O(cells × tiles) match off the main thread so selecting a
  // heavy metric (notably "Best"/ΔE2000) can't freeze the UI. Lazily created; stays null
  // where Worker isn't available (jsdom/SSR), where we fall back to a synchronous match.
  const matchWorkerRef = useRef<Worker | null>(null);
  // Monotonic id per match request; a response whose id isn't the latest is dropped, so
  // rapid algorithm toggles always settle on the last-selected one.
  const matchReqIdRef = useRef(0);
  // Latest onPainted, so the paint closure always calls the current one without the
  // match effect having to depend on (and re-run for) its identity.
  const onPaintedRef = useRef(onPainted);
  onPaintedRef.current = onPainted;

  // Sample the target image whenever it (or the resolution) changes. Cheap enough
  // to redo, but kept in a ref so an algorithm toggle re-matches without re-sampling.
  useEffect(() => {
    let active = true;
    resetZoom();
    setDimensions(null);
    // New image invalidates prior sample/tiles/data.
    sampledRef.current = null;
    tileCacheRef.current = new Map();
    dataRef.current = null;
    sampleGrid(image.url, resolution).then((sampled) => {
      if (!active || !sampled) return;
      sampledRef.current = sampled;
      setDimensions({ cols: sampled.cols, rows: sampled.rows });
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
      matchWorkerRef.current = new Worker(new URL('./mosaic-match.worker.ts', import.meta.url), {
        type: 'module',
      });
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
          if (active) onPaintedRef.current();
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
  }, [algorithm, tiles, dimensions, getMatchWorker]);

  // Tear down the match worker on unmount.
  useEffect(
    () => () => {
      matchWorkerRef.current?.terminate();
      matchWorkerRef.current = null;
    },
    [],
  );

  return { dimensions, matching, canvasRef, dataRef, tileCacheRef };
}
