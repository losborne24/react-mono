# @react-mono/mosaify-data

Data-access layer for the **mosaify** app. Owns the Spotify Web API integration
(OAuth + endpoints) and the built-in sample images. UI and feature libraries
consume these functions rather than talking to Spotify or `fetch` directly.

## What's inside

### Spotify (`src/lib/spotify`)

Authorization Code + **PKCE** flow for a browser SPA — public client ID only, no
secret. Tokens live in `sessionStorage` and survive the full-page OAuth redirect.

| File | Role |
|---|---|
| `config.ts` | `SPOTIFY_CONFIG` (clientId, redirectUri, scopes, endpoints) + `isSpotifyConfigured()` |
| `pkce.ts` | Code verifier, S256 challenge, and state generation |
| `auth.ts` | `beginLogin`, `handleRedirectCallback`, `getValidAccessToken` (auto-refresh), `isLoggedIn`, `logout` |
| `client.ts` | `spotifyGet` — attaches the bearer token, maps 401 → `SpotifyAuthError` |
| `endpoints.ts` | `fetchCurrentUser`, `fetchUserPlaylists`, `fetchPlaylist`, `fetchSearchPlaylists`, `fetchPlaylistArtworkPage` |
| `types.ts` | Spotify Web API response shapes |

See [`AUTH_FLOW.md`](./src/lib/spotify/AUTH_FLOW.md) for the full login → callback →
token-exchange → refresh sequence diagram.

Playlist artwork is fetched a page at a time (`fetchPlaylistArtworkPage`, 100
tiles/page) so callers can page incrementally and tag each tile with its average
colour for the mosaic.

### Sample images (`src/lib/sample-images.ts`)

`SAMPLE_IMAGES` — a bundled set of `SourceImage`s used as a fallback / demo
source when Spotify isn't connected.

## Configuration

Set these env vars (Vite) for Spotify auth to work:

| Variable | Purpose | Default |
|---|---|---|
| `VITE_SPOTIFY_CLIENT_ID` | Public client ID from the Spotify dashboard | — (required) |
| `VITE_SPOTIFY_REDIRECT_URI` | Must match the dashboard exactly; use `127.0.0.1`, not `localhost` | `http://127.0.0.1:4200/` |

`isSpotifyConfigured()` returns `false` when the client ID is missing.

## Usage

```ts
import {
  beginLogin,
  fetchUserPlaylists,
  fetchPlaylistArtworkPage,
  SAMPLE_IMAGES,
} from '@react-mono/mosaify-data';
```

## Running unit tests

Run `nx test @react-mono/mosaify-data` to execute the unit tests via [Vitest](https://vitest.dev/).
