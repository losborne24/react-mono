import { useEffect, useState } from 'react';
import {
  beginLogin,
  fetchCurrentUser,
  handleRedirectCallback,
  isLoggedIn,
  isSpotifyConfigured,
  logout,
} from '@react-mono/mosaify-data';

export type AuthStatus =
  | 'checking' // resolving an OAuth redirect / existing session
  | 'unauthenticated'
  | 'authenticated';

export interface SpotifyProfile {
  name: string;
  avatar: string | null;
}

export interface SpotifyAuth {
  /** Whether Spotify OAuth is configured for this build. */
  configured: boolean;
  status: AuthStatus;
  error: string | null;
  profile: SpotifyProfile | null;
  /** Start the OAuth redirect flow. */
  connect: () => void;
  /** Clear the session and return to `unauthenticated`. */
  signOut: () => void;
}

/**
 * Owns Spotify authentication: resolves the OAuth redirect on mount, tracks
 * session status, loads the signed-in profile, and exposes connect / signOut.
 * Kept separate from the wizard flow so step orchestration stays auth-agnostic.
 */
export function useSpotifyAuth(): SpotifyAuth {
  const configured = isSpotifyConfigured();
  const [status, setStatus] = useState<AuthStatus>(configured ? 'checking' : 'unauthenticated');
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<SpotifyProfile | null>(null);

  // On mount: resolve an OAuth redirect, or pick up an existing session.
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;

    (async () => {
      try {
        const tokens = await handleRedirectCallback();
        if (cancelled) return;
        setStatus(tokens || isLoggedIn() ? 'authenticated' : 'unauthenticated');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Sign-in failed.');
        setStatus('unauthenticated');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configured]);

  // Load the profile once authenticated.
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;

    (async () => {
      try {
        const me = await fetchCurrentUser();
        if (!cancelled) setProfile(me);
      } catch {
        if (!cancelled) setProfile(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  const connect = () => {
    if (!configured) return;
    beginLogin().catch((err) => setError(err instanceof Error ? err.message : 'Sign-in failed.'));
  };

  const signOut = () => {
    logout();
    setStatus('unauthenticated');
    setProfile(null);
    setError(null);
  };

  return { configured, status, error, profile, connect, signOut };
}
