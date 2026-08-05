import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IconPlus, IconMinus, IconZoomReset, IconLoader2 } from '@tabler/icons-react';
import type { SourceImage } from '@react-mono/models';
import {
  DEFAULT_MATCH_ALGORITHM,
  runMatch,
  type MatchAlgorithmId,
  type MatchedCell,
} from './mosaic-match';
import type { MatchRequest, MatchResponse } from './mosaic-match.worker';
import {
  DETAIL_MAX_CELLS,
  paintDetail,
  paintMosaic,
  sampleGrid,
  type MosaicData,
  type SampledGrid,
  type TileCache,
} from './mosaic-canvas';
import { renderJpeg, renderPdf, renderSvg } from './mosaic-export';
import { MIN_SCALE, usePanZoom } from './use-pan-zoom';
import { ICON_SIZE } from '@react-mono/shared-ui';

export interface MosaicGridProps {
  image: SourceImage;
  /** Album/playlist artwork used as mosaic tiles. Each carries an average `color`. */
  tiles: SourceImage[];
  /** Tile count along the image's longer edge; the shorter edge follows its aspect. */
  resolution: number;
  /** Selected matching-algorithm id (see MATCH_ALGORITHMS). Controlled by the parent. */
  algorithm: MatchAlgorithmId;
  /** Reports the derived grid once the image aspect is known (for stats/labels). */
  onGrid?: (grid: { cols: number; rows: number }) => void;
}

/** Imperative handle for exporting the painted mosaic (download/share). */
export interface MosaicGridHandle {
  /** The mosaic as a JPEG blob, or `null` if not painted yet. */
  toBlob: () => Promise<Blob | null>;
  /**
   * The mosaic as a self-contained SVG that embeds each unique cover once — full
   * 640px per tile at any density. `null` if the mosaic isn't painted yet.
   */
  toSvg: () => Promise<Blob | null>;
  /**
   * The mosaic as a print-ready PDF that embeds each unique cover once (sized to the
   * cell's print DPI) and references it per cell. `null` if not painted yet.
   */
  toPdf: () => Promise<Blob | null>;
}

/**
 * Re-exported from `mosaic-match.ts` so the public API (consumed by the feature lib's
 * toggle) is unchanged; the matching logic itself now lives there so it can run inside
 * `mosaic-match.worker.ts` off the main thread.
 */
export type { MatchAlgorithmId, MatchAlgorithmOption } from './mosaic-match';
export { MATCH_ALGORITHMS } from './mosaic-match';
export { DEFAULT_MATCH_ALGORITHM };

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
  { image, tiles, resolution, algorithm, onGrid },
  ref,
) {
  const [dimensions, setDimensions] = useState<{ cols: number; rows: number } | null>(null);
  // True while the worker is computing a match, to show a spinner over the canvas.
  const [matching, setMatching] = useState(false);
  // Sampled target grid for the current image, reused when only the algorithm changes.
  const sampledRef = useRef<SampledGrid | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Overlay canvas, redrawn crisp on zoom-settle (see drawDetail).
  const detailRef = useRef<HTMLCanvasElement>(null);
  // Decoded tiles + mosaic data kept for detail redraws without re-decoding.
  const tileCacheRef = useRef<TileCache>(new Map());
  const dataRef = useRef<MosaicData | null>(null);
  // Web Worker running the O(cells × tiles) match off the main thread so selecting a
  // heavy metric (notably "Best"/ΔE2000) can't freeze the UI. Lazily created; stays null
  // where Worker isn't available (jsdom/SSR), where we fall back to a synchronous match.
  const matchWorkerRef = useRef<Worker | null>(null);
  // Monotonic id per match request; a response whose id isn't the latest is dropped, so
  // rapid algorithm toggles always settle on the last-selected one.
  const matchReqIdRef = useRef(0);

  const { frameRef, transformLayerRef, getTransform, frameHandlers, zoomIn, zoomOut, resetZoom } =
    usePanZoom({ onTransform: () => drawDetail() });

  // Redraw the crisp overlay during motion. Only update it per frame when the
  // visible-cell count is low enough for 60fps; otherwise hide it and show the
  // base canvas.
  const drawDetail = useCallback(() => {
    const frame = frameRef.current;
    const detail = detailRef.current;
    const data = dataRef.current;
    if (!frame || !detail || !data) return;
    const rect = frame.getBoundingClientRect();
    // Visible cells ≈ total / scale² (each axis shrinks by `scale`). Above the cap
    // the per-frame drawImage cost risks dropping frames — fall back to the base.
    const t = getTransform();
    const visibleCells = (data.cols * data.rows) / (t.scale * t.scale);
    if (t.scale <= MIN_SCALE || visibleCells > DETAIL_MAX_CELLS) {
      detail.style.opacity = '0';
      return;
    }
    paintDetail(detail, data, tileCacheRef.current, t, rect.width, rect.height);
    detail.style.opacity = '1';
  }, [frameRef, getTransform]);

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
  }, [algorithm, tiles, dimensions, drawDetail, getMatchWorker]);

  // Tear down the match worker on unmount (pan/zoom's own rAF cleanup lives in usePanZoom).
  useEffect(
    () => () => {
      matchWorkerRef.current?.terminate();
      matchWorkerRef.current = null;
    },
    [],
  );

  const cols = dimensions?.cols ?? resolution;
  const rows = dimensions?.rows ?? resolution;
  const hasMosaic = dimensions !== null;

  // Expose the painted mosaic for download/share. Renders a fresh high-resolution
  // export (see renderJpeg/renderSvg/renderPdf) rather than reading the GPU-capped
  // on-screen canvas, so saved tiles are crisp instead of the ~20px they appear on screen.
  useImperativeHandle(
    ref,
    () => ({
      toBlob: async () => {
        const data = dataRef.current;
        if (!data || !hasMosaic) return null;
        return renderJpeg(data, tileCacheRef.current);
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
        {...frameHandlers}
      >
        <div
          ref={transformLayerRef}
          className="absolute inset-0"
          style={{ transformOrigin: 'center' }}
        >
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
        {/* Crisp overlay: the base canvas is CSS-scaled by the transform and blurs
          when zoomed in, so this sibling (not transformed) re-rasterizes just the
          visible cells at device res each frame, mapping the slice straight into
          frame pixels. Hidden until few enough cells are visible to redraw per
          frame (scale > 1 AND cols*rows/scale² ≤ DETAIL_MAX_CELLS); see drawDetail. */}
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
            <IconLoader2 size={ICON_SIZE.md} className="animate-spin" />
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1 rounded-xl border border-white/10 bg-black/50 p-1 backdrop-blur-sm">
          <ZoomButton label="Zoom in" onClick={zoomIn}>
            <IconPlus size={ICON_SIZE.md} />
          </ZoomButton>
          <ZoomButton label="Zoom out" onClick={zoomOut}>
            <IconMinus size={ICON_SIZE.md} />
          </ZoomButton>
          <ZoomButton label="Reset zoom" onClick={resetZoom}>
            <IconZoomReset size={ICON_SIZE.md} />
          </ZoomButton>
        </div>
      </div>
    </div>
  );
});

export default MosaicGrid;
