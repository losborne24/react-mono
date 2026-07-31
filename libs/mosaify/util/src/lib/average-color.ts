/**
 * Average pixel colour of an image, computed in-browser: the image is drawn
 * onto a 1×1 canvas, letting the GPU downscale to a single averaged pixel.
 * No dependency, one `getImageData` read per image.
 *
 * Best-effort — cross-origin images that don't allow CORS taint the canvas and
 * make `getImageData` throw, and network failures reject the load. Both resolve
 * to `null` so callers can carry on without a colour.
 */
function computeAverageColor(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Spotify's CDN (i.scdn.co) serves CORS headers; required to read pixels.
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        resolve(`rgb(${r}, ${g}, ${b})`);
      } catch {
        // Tainted canvas (CORS) — no pixel access.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Per-URL cache of the in-flight/resolved colour promise. The same album art
 * recurs across tracks and pages, so this collapses repeat work to one canvas
 * read per URL for the process lifetime. Caching the promise (not the value)
 * also dedupes concurrent callers for the same URL.
 */
const colorCache = new Map<string, Promise<string | null>>();

/** Memoized {@link computeAverageColor} — one canvas read per unique URL. */
export function averageColor(url: string): Promise<string | null> {
  let cached = colorCache.get(url);
  if (!cached) {
    cached = computeAverageColor(url);
    colorCache.set(url, cached);
  }
  return cached;
}
