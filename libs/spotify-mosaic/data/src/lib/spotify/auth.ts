import { SPOTIFY_CONFIG } from './config';
import {
  deriveCodeChallenge,
  generateCodeVerifier,
  generateState,
} from './pkce';

/**
 * Authorization Code + PKCE flow for a browser SPA. Client ID only — no secret.
 *
 * Token lifecycle is kept in sessionStorage so a full-page OAuth redirect
 * survives the round-trip. Tokens are user-scoped and short-lived; sessionStorage
 * (cleared on tab close) is an acceptable store for a client-only app. A backend
 * proxy would be stricter, but that's a separate architecture (see config.ts).
 */

const STORAGE = {
  verifier: 'spotify.pkce_verifier',
  state: 'spotify.oauth_state',
  token: 'spotify.access_token',
  expiry: 'spotify.expires_at',
  refresh: 'spotify.refresh_token',
} as const;

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // epoch ms
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/** Kick off login: build the PKCE challenge and redirect to Spotify. */
export async function beginLogin(): Promise<void> {
  const verifier = generateCodeVerifier();
  const challenge = await deriveCodeChallenge(verifier);
  const state = generateState();

  sessionStorage.setItem(STORAGE.verifier, verifier);
  sessionStorage.setItem(STORAGE.state, state);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: SPOTIFY_CONFIG.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SPOTIFY_CONFIG.scopes.join(' '),
    // Force the account/consent screen so users can pick a different account
    // rather than being silently reauthenticated into their existing session.
    show_dialog: 'true',
  });

  window.location.assign(`${SPOTIFY_CONFIG.authUrl}?${params.toString()}`);
}

// Auth codes are single-use. React StrictMode (and any accidental double
// mount) invokes the callback handler twice; memoize the in-flight exchange so
// both callers share one result instead of racing to spend the same code.
let pendingCallback: Promise<SpotifyTokens | null> | null = null;

/**
 * Detect an OAuth redirect (?code=…&state=…) and, if present, exchange the
 * code for tokens. Returns tokens on success, null if there's no callback to
 * handle. Throws on state mismatch or a token-exchange error.
 */
export function handleRedirectCallback(): Promise<SpotifyTokens | null> {
  if (!pendingCallback) {
    pendingCallback = exchangeCallback();
  }
  return pendingCallback;
}

async function exchangeCallback(): Promise<SpotifyTokens | null> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    clearOauthTransients();
    throw new Error(`Spotify authorization failed: ${error}`);
  }
  if (!code) return null;

  const storedState = sessionStorage.getItem(STORAGE.state);
  const verifier = sessionStorage.getItem(STORAGE.verifier);
  if (!storedState || returnedState !== storedState || !verifier) {
    clearOauthTransients();
    throw new Error('Spotify OAuth state mismatch — possible CSRF, aborting.');
  }

  const body = new URLSearchParams({
    client_id: SPOTIFY_CONFIG.clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: SPOTIFY_CONFIG.redirectUri,
    code_verifier: verifier,
  });

  const tokens = await requestToken(body);
  clearOauthTransients();
  // Scrub the code/state from the URL so a refresh doesn't re-run the exchange.
  window.history.replaceState({}, document.title, url.pathname);
  return tokens;
}

/** Valid stored token, transparently refreshed if expired. Null if logged out. */
export async function getValidAccessToken(): Promise<string | null> {
  const token = sessionStorage.getItem(STORAGE.token);
  const expiresAt = Number(sessionStorage.getItem(STORAGE.expiry) ?? 0);

  if (token && Date.now() < expiresAt - 30_000) return token;

  const refreshToken = sessionStorage.getItem(STORAGE.refresh);
  if (!refreshToken) return null;

  const body = new URLSearchParams({
    client_id: SPOTIFY_CONFIG.clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  try {
    const tokens = await requestToken(body);
    return tokens.accessToken;
  } catch {
    logout();
    return null;
  }
}

export function isLoggedIn(): boolean {
  return sessionStorage.getItem(STORAGE.token) != null;
}

export function logout(): void {
  Object.values(STORAGE).forEach((k) => sessionStorage.removeItem(k));
}

async function requestToken(body: URLSearchParams): Promise<SpotifyTokens> {
  const res = await fetch(SPOTIFY_CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Spotify token request failed (${res.status})`);
  }
  const data = (await res.json()) as TokenResponse;
  const tokens: SpotifyTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? sessionStorage.getItem(STORAGE.refresh),
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  persist(tokens);
  return tokens;
}

function persist(tokens: SpotifyTokens): void {
  sessionStorage.setItem(STORAGE.token, tokens.accessToken);
  sessionStorage.setItem(STORAGE.expiry, String(tokens.expiresAt));
  if (tokens.refreshToken) {
    sessionStorage.setItem(STORAGE.refresh, tokens.refreshToken);
  }
}

function clearOauthTransients(): void {
  sessionStorage.removeItem(STORAGE.verifier);
  sessionStorage.removeItem(STORAGE.state);
}
