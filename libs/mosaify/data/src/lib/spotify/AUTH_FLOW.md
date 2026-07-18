# Spotify Auth Data Flow

PKCE authorization-code flow. Tokens stored in `sessionStorage`. All code in the `mosaify` project.

## Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant App as app.tsx / wizard
    participant Auth as auth.ts
    participant SS as sessionStorage
    participant SP as accounts.spotify.com
    participant API as api.spotify.com

    Note over U,API: 1. Login
    U->>App: Click "Connect with Spotify"
    App->>Auth: connect() → beginLogin()
    Auth->>Auth: gen verifier, challenge(S256), state
    Auth->>SS: write pkce_verifier + oauth_state
    Auth->>SP: redirect /authorize?client_id,challenge,state,scope

    Note over U,API: 2. Callback
    SP-->>App: redirect redirectUri ?code&state
    App->>Auth: handleRedirectCallback()
    Auth->>SS: read oauth_state (validate == returned state)
    Auth->>SS: read pkce_verifier

    Note over U,API: 3. Token exchange
    Auth->>SP: POST /token (code, verifier, client_id)
    SP-->>Auth: access_token, refresh_token, expires_in
    Auth->>SS: persist access_token, refresh_token, expires_at
    Auth->>Auth: clear transients + scrub URL

    Note over U,API: 4. API use (spotifyGet)
    App->>Auth: getValidAccessToken()
    alt token valid (>30s)
        Auth-->>App: access_token
    else expired
        Auth->>SP: POST /token (refresh_token)
        SP-->>Auth: new tokens
        Auth->>SS: re-persist
        Auth-->>App: access_token
    end
    App->>API: GET /me, /me/playlists (Bearer token)
    API-->>App: profile + playlists → mosaic

    Note over U,API: 5. Failure
    API-->>App: 401
    App->>Auth: logout()
    Auth->>SS: clear all keys → unauthenticated
```

## Key files

| File | Role |
|---|---|
| `auth.ts` | Login, callback, token exchange, refresh, persist, logout |
| `pkce.ts` | Code verifier, S256 challenge, state generation |
| `client.ts` | `spotifyGet` — Bearer header, 401 → logout |
| `config.ts` | `SPOTIFY_CONFIG` (clientId, redirectUri, scopes, URLs) |
| `endpoints.ts` | `/me`, `/me/playlists`, playlist artwork |
| `../../feature/src/lib/use-mosaify-wizard.ts` | Orchestration (connect, callback effect, fetches) |

## sessionStorage keys

- `spotify.pkce_verifier` — transient, cleared after exchange
- `spotify.oauth_state` — transient, CSRF check
- `spotify.access_token`
- `spotify.refresh_token`
- `spotify.expires_at`
