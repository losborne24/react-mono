/**
 * Spotify OAuth + Web API configuration.
 *
 * SECURITY: this is a browser SPA. Only the *public* client ID is used, via the
 * Authorization Code + PKCE flow. The client SECRET must never appear here or
 * anywhere in the shipped bundle — it is for confidential (server-side) clients
 * only. If a token-exchange backend is ever added, the secret lives there.
 */
export const SPOTIFY_CONFIG = {
  clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '',
  // Spotify requires a secure redirect URI: https, or loopback http://127.0.0.1.
  // "localhost" is rejected — use 127.0.0.1. Must match the dashboard exactly.
  redirectUri:
    import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://127.0.0.1:4200/',
  scopes: ['playlist-read-private', 'user-read-private'] as const,
  authUrl: 'https://accounts.spotify.com/authorize',
  tokenUrl: 'https://accounts.spotify.com/api/token',
  apiBase: 'https://api.spotify.com/v1',
} as const;

export function isSpotifyConfigured(): boolean {
  return SPOTIFY_CONFIG.clientId.length > 0;
}
