/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Spotify OAuth client ID (safe to ship — NOT the secret). */
  readonly VITE_SPOTIFY_CLIENT_ID?: string;
  /** OAuth redirect URI; must match the Spotify dashboard exactly. */
  readonly VITE_SPOTIFY_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
