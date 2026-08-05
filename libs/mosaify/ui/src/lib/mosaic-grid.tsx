import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { IconPlus, IconMinus, IconZoomReset, IconLoader2 } from '@tabler/icons-react';
import type { SourceImage } from '@react-mono/models';
import { DEFAULT_MATCH_ALGORITHM, type MatchAlgorithmId } from './mosaic-match';
import { DETAIL_MAX_CELLS, paintDetail } from './mosaic-canvas';
import type { MosaicData, TileCache } from './mosaic-canvas';
import { renderJpeg, renderPdf, renderSvg } from './mosaic-export';
import { MIN_SCALE, usePanZoom } from './use-pan-zoom';
import { useMosaicMatch } from './use-mosaic-match';
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

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

/** Bottom-right zoom overlay: in / out / reset. */
function ZoomControls({ onZoomIn, onZoomOut, onReset }: ZoomControlsProps) {
  return (
    <div className="absolute bottom-3 right-3 flex flex-col gap-1 rounded-xl border border-white/10 bg-black/50 p-1 backdrop-blur-sm">
      <ZoomButton label="Zoom in" onClick={onZoomIn}>
        <IconPlus size={ICON_SIZE.md} />
      </ZoomButton>
      <ZoomButton label="Zoom out" onClick={onZoomOut}>
        <IconMinus size={ICON_SIZE.md} />
      </ZoomButton>
      <ZoomButton label="Reset zoom" onClick={onReset}>
        <IconZoomReset size={ICON_SIZE.md} />
      </ZoomButton>
    </div>
  );
}

interface MosaicLayerProps {
  transformLayerRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  hasMosaic: boolean;
  image: SourceImage;
}

/** Transformed layer holding the painted mosaic canvas (or the source image placeholder). */
function MosaicLayer({ transformLayerRef, canvasRef, hasMosaic, image }: MosaicLayerProps) {
  return (
    <div ref={transformLayerRef} className="absolute inset-0" style={{ transformOrigin: 'center' }}>
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
  );
}

/**
 * Crisp overlay: the base canvas is CSS-scaled by the transform and blurs when zoomed in, so
 * this sibling (not transformed) re-rasterizes just the visible cells at device res each frame,
 * mapping the slice straight into frame pixels. Hidden until few enough cells are visible to
 * redraw per frame (scale > 1 AND cols*rows/scale² ≤ DETAIL_MAX_CELLS); see drawDetail.
 */
function DetailOverlay({ detailRef }: { detailRef: RefObject<HTMLCanvasElement | null> }) {
  return (
    <canvas
      ref={detailRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0, transition: 'opacity 0ms ease-out' }}
    />
  );
}

/** Static radial darkening at the frame edges. */
function Vignette() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)',
      }}
    />
  );
}

/** Spinner shown top-right while the worker computes the tile match. */
function ProcessingSpinner() {
  return (
    <div className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/80 backdrop-blur-sm pointer-events-none">
      <IconLoader2 size={ICON_SIZE.md} className="animate-spin" />
    </div>
  );
}

// Photomosaic: target image sampled per cell, each cell filled with the tile
// whose average colour is nearest to the sampled colour. The grid dimensions are
// derived from the image's aspect ratio (see `sampleGrid`), not fixed.
export const MosaicGrid = forwardRef<MosaicGridHandle, MosaicGridProps>(function MosaicGrid(
  { image, tiles, resolution, algorithm, onGrid },
  ref,
) {
  // Overlay canvas, redrawn crisp on zoom-settle (see drawDetail).
  const detailRef = useRef<HTMLCanvasElement>(null);

  const { frameRef, transformLayerRef, getTransform, frameHandlers, zoomIn, zoomOut, resetZoom } =
    usePanZoom({ onTransform: () => drawDetail() });

  const { dimensions, matching, canvasRef, dataRef, tileCacheRef } = useMosaicMatch({
    image,
    tiles,
    resolution,
    algorithm,
    onGrid,
    resetZoom,
    onPainted: () => drawDetail(),
  });

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
  }, [frameRef, getTransform, dataRef, tileCacheRef]);

  const cols = dimensions?.cols ?? resolution;
  const rows = dimensions?.rows ?? resolution;
  const hasMosaic = dimensions !== null;

  // Expose the painted mosaic for download/share. Renders a fresh high-resolution
  // export (see renderJpeg/renderSvg/renderPdf) rather than reading the GPU-capped
  // on-screen canvas, so saved tiles are crisp instead of the ~20px they appear on screen.
  useImperativeHandle(
    ref,
    () => {
      // Each export renders from the painted data, or resolves null before it exists.
      const render =
        (fn: (data: MosaicData, cache: TileCache) => Promise<Blob | null>) => async () => {
          const data = dataRef.current;
          if (!data || !hasMosaic) return null;
          return fn(data, tileCacheRef.current);
        };
      return {
        toBlob: render(renderJpeg),
        toSvg: render(renderSvg),
        toPdf: render(renderPdf),
      };
    },
    [hasMosaic, dataRef, tileCacheRef],
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
        <MosaicLayer
          transformLayerRef={transformLayerRef}
          canvasRef={canvasRef}
          hasMosaic={hasMosaic}
          image={image}
        />
        <DetailOverlay detailRef={detailRef} />
        <Vignette />
        {matching && <ProcessingSpinner />}
        <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} />
      </div>
    </div>
  );
});

export default MosaicGrid;
