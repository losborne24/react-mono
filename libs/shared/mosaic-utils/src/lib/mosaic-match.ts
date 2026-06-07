// Pure tile-matching logic shared by the main thread and the mosaic web worker.
// Kept dependency-free so it can be imported into both contexts.

// Premultiply each track's average colour once, so the per-pixel loop doesn't
// recompute it. Input avgColour is [r, g, b, a] with 0-255 channels.
export function normaliseTrackColours(avgColours: number[][]): number[][] {
  return avgColours.map((c) => {
    const a = c[3] / 255;
    return [(c[0] * a) / 255, (c[1] * a) / 255, (c[2] * a) / 255, a];
  });
}

// For every pixel, find the index of the nearest track colour. Returns a flat
// Int32Array of track indices (length w*h). Distance formula is byte-identical
// to the original per-pixel implementation.
export function matchIndices(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  trackColours: number[][]
): Int32Array {
  const indices = new Int32Array(w * h);
  const n = trackColours.length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const a = data[p + 3] / 255;
      const r = (data[p] * a) / 255;
      const g = (data[p + 1] * a) / 255;
      const b = (data[p + 2] * a) / 255;
      let minDist = Infinity;
      let index = 0;
      for (let i = 0; i < n; i++) {
        const tc = trackColours[i];
        const dist =
          Math.max(
            Math.pow(r - tc[0], 2),
            Math.pow(r - tc[0] - a + tc[3], 2)
          ) +
          Math.max(
            Math.pow(g - tc[1], 2),
            Math.pow(g - tc[1] - a + tc[3], 2)
          ) +
          Math.max(
            Math.pow(b - tc[2], 2),
            Math.pow(b - tc[2] - a + tc[3], 2)
          );
        if (dist < minDist) {
          minDist = dist;
          index = i;
        }
      }
      indices[y * w + x] = index;
    }
  }
  return indices;
}
