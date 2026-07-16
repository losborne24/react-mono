import { SPOTIFY_CONFIG } from './config';
import { getValidAccessToken, logout } from './auth';

export class SpotifyAuthError extends Error {}

/**
 * Authenticated GET against the Spotify Web API. Attaches a valid bearer token
 * (refreshing if needed), and surfaces 401 as SpotifyAuthError so callers can
 * route the user back to login.
 */
export async function spotifyGet<T>(path: string): Promise<T> {
  const token = await getValidAccessToken();
  if (!token) throw new SpotifyAuthError('Not authenticated with Spotify.');

  const url = path.startsWith('http') ? path : `${SPOTIFY_CONFIG.apiBase}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    logout();
    throw new SpotifyAuthError('Spotify session expired.');
  }
  if (!res.ok) {
    throw new Error(`Spotify API error ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}
