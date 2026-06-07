// Spotify Authorization Code + PKCE: challenge generation, the token exchange,
// token storage, and silent refresh. No client secret (public client).
import axios from 'axios';
import * as constants from './constants.js';
import { AuthTokens } from '@org/models';

const STORAGE_KEY = 'spotifyTokens';
const STATE_KEY = 'authState';

// ---- PKCE helpers ----

async function sha256(plain: string): Promise<ArrayBuffer> {
  return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  let binary = '';
  new Uint8Array(buffer).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(length: number): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = window.crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join('');
}

// ---- Token storage ----

export function getTokens(): AuthTokens | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthTokens;
  } catch {
    return null;
  }
}

function storeTokens(data: {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}): AuthTokens {
  const existing = getTokens();
  const tokens: AuthTokens = {
    accessToken: data.access_token,
    // Spotify omits refresh_token on refresh sometimes — keep the old one.
    refreshToken: data.refresh_token ?? existing?.refreshToken ?? null,
    expiresAt: nowMs() + data.expires_in * 1000,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  return tokens;
}

export function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Indirection so the rest of the app never calls Date.now() directly.
function nowMs(): number {
  return new Date().getTime();
}

// ---- Authorization redirect ----

// Build the /authorize URL (storing verifier + state) and send the user there.
export async function beginLogin(): Promise<void> {
  const state = window.crypto.randomUUID();
  const codeVerifier = randomString(64);
  const codeChallenge = base64UrlEncode(await sha256(codeVerifier));
  localStorage.setItem(STATE_KEY, state);
  localStorage.setItem(constants.code_verifier_key, codeVerifier);

  const params = new URLSearchParams({
    client_id: constants.client_id,
    response_type: constants.response_type,
    redirect_uri: constants.redirect_uri,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    scope: constants.scopes,
    state,
  });
  window.location.href = `${constants.authorize_url}?${params.toString()}`;
}

// Exchange the `?code=...` from the redirect for tokens. Returns null if the
// URL has no valid code/state (i.e. this isn't a post-login navigation).
export async function completeLogin(): Promise<AuthTokens | null> {
  const search = new URLSearchParams(window.location.search);
  const code = search.get('code');
  const state = search.get('state');
  const codeVerifier = localStorage.getItem(constants.code_verifier_key);
  if (!code || state !== localStorage.getItem(STATE_KEY) || !codeVerifier) {
    return null;
  }
  const res = await axios.post(
    constants.token_url,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: constants.redirect_uri,
      client_id: constants.client_id,
      code_verifier: codeVerifier,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  localStorage.removeItem(constants.code_verifier_key);
  return storeTokens(res.data);
}

// ---- Refresh ----

export async function refreshTokens(): Promise<AuthTokens | null> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) return null;
  try {
    const res = await axios.post(
      constants.token_url,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        client_id: constants.client_id,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return storeTokens(res.data);
  } catch {
    clearTokens();
    return null;
  }
}

// Return a valid access token, refreshing first if it expires within 60s.
// Returns null if there's no session and refresh isn't possible.
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens) return null;
  if (tokens.expiresAt - nowMs() > 60_000) return tokens.accessToken;
  const refreshed = await refreshTokens();
  return refreshed?.accessToken ?? null;
}
