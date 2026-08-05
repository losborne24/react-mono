import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
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
  type Transform,
} from './mosaic-canvas';
import { renderJpeg, renderPdf, renderSvg } from './mosaic-export';
import { ICON_SIZE } from '../../../../shared/ui/src/lib/icon-size';

const MIN_SCALE = 1;
const MAX_SCALE = 150;
const ZOOM_SENSITIVITY = 0.01;
/** Multiplier per +/− button press. */
const ZOOM_STEP = 1.8;

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
  algorithm?: MatchAlgorithmId;
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
          <ZoomButton label="Zoom in" onClick={() => zoomByStep(ZOOM_STEP)}>
            <IconPlus size={ICON_SIZE.md} />
          </ZoomButton>
          <ZoomButton label="Zoom out" onClick={() => zoomByStep(1 / ZOOM_STEP)}>
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
