import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { Transform } from './mosaic-canvas';

export const MIN_SCALE = 1;
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

function cursorFor(scale: number, dragging: boolean): string {
  if (scale <= MIN_SCALE) return 'default';
  return dragging ? 'grabbing' : 'grab';
}

export interface UsePanZoomOptions {
  /** Called (in the same rAF that writes the DOM transform) after each transform change. */
  onTransform: () => void;
}

export interface UsePanZoom {
  /** Attach to the interaction frame; drives bounds and pointer geometry. */
  frameRef: RefObject<HTMLDivElement | null>;
  /** Attach to the GPU-composited content layer that receives the CSS transform. */
  transformLayerRef: RefObject<HTMLDivElement | null>;
  /** Current live transform (read from the ref, not React state). */
  getTransform: () => Transform;
  /** Spread onto the frame element to wire up drag/pinch/reset. */
  frameHandlers: {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onDoubleClick: () => void;
  };
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

/**
 * Pan/zoom (wheel, drag, pinch, +/− buttons) for the mosaic frame. The live transform
 * lives in a ref, not state: the mosaic can be ~40k <img> nodes, so re-rendering per
 * frame is what makes pan/zoom lag. We write the transform straight onto the
 * (GPU-composited) content layer instead — no React reconcile.
 */
export function usePanZoom({ onTransform }: UsePanZoomOptions): UsePanZoom {
  // Latest onTransform, so the rAF closure always calls the current one without
  // re-subscribing listeners on every render.
  const onTransformRef = useRef(onTransform);
  onTransformRef.current = onTransform;

  const frameRef = useRef<HTMLDivElement>(null);
  const transformLayerRef = useRef<HTMLDivElement>(null);
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

  const getTransform = useCallback(() => transformRef.current, []);

  // Push the current transform to the DOM on the next frame (coalesces bursts of
  // wheel/move events into one write per frame) and reflect zoom state on the cursor.
  const applyTransform = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const t = transformRef.current;
      const transformLayer = transformLayerRef.current;
      if (transformLayer) {
        transformLayer.style.transform = `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scale})`;
        transformLayer.style.willChange = 'transform';
      }
      onTransformRef.current();
      if (frameRef.current) {
        frameRef.current.style.cursor = cursorFor(t.scale, dragRef.current !== null);
      }
    });
  }, []);

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

  const zoomIn = useCallback(() => zoomByStep(ZOOM_STEP), [zoomByStep]);
  const zoomOut = useCallback(() => zoomByStep(1 / ZOOM_STEP), [zoomByStep]);

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

  return {
    frameRef,
    transformLayerRef,
    getTransform,
    frameHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onDoubleClick: resetZoom,
    },
    zoomIn,
    zoomOut,
    resetZoom,
  };
}
