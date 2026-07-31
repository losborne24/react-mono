/**
 * Extract a Spotify playlist id from a raw id, URL, or `spotify:` URI.
 * Returns null when the input isn't a recognisable playlist reference.
 */
export function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/playlist[/:]([a-zA-Z0-9]+)/);
  if (fromUrl) return fromUrl[1];
  // A bare base62 id (Spotify ids are 22 chars, but stay lenient).
  if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) return trimmed;
  return null;
}
