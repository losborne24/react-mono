import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  // Errors from the imperative connect() redirect kickoff; auth-resolution
  // errors come from the session query below.
  const [connectError, setConnectError] = useState<string | null>(null);

  // Resolve an OAuth redirect (or pick up an existing session) on mount.
  // Kept outside the 'spotify' key namespace so signOut's removeQueries can
  // clear account data without also wiping — and refetching — the session.
  const {
    data: authenticated = false,
    error: sessionError,
    isPending: sessionPending,
  } = useQuery({
    queryKey: ['spotify-session'],
    queryFn: async () => {
      const tokens = await handleRedirectCallback();
      return Boolean(tokens || isLoggedIn());
    },
    enabled: configured,
    staleTime: Infinity,
    retry: false,
  });

  let status: AuthStatus = 'unauthenticated';
  if (configured && sessionPending) status = 'checking';
  else if (authenticated) status = 'authenticated';

  const error =
    connectError ??
    (sessionError
      ? sessionError instanceof Error
        ? sessionError.message
        : 'Sign-in failed.'
      : null);

  // Load the profile once authenticated. Never goes stale: the profile is
  // static for a session, so skip the default window-focus refetch. Cleared
  // on signOut via removeQueries.
  const { data: profile = null } = useQuery({
    queryKey: ['spotify', 'me'],
    queryFn: fetchCurrentUser,
    enabled: status === 'authenticated',
    staleTime: Infinity,
  });

  const connect = () => {
    if (!configured) return;
    beginLogin().catch((err) =>
      setConnectError(err instanceof Error ? err.message : 'Sign-in failed.'),
    );
  };

  const signOut = () => {
    logout();
    setConnectError(null);
    // Flip the session to unauthenticated without a refetch, and drop cached
    // Spotify data so a re-login can't show the prior account's.
    queryClient.setQueryData(['spotify-session'], false);
    queryClient.removeQueries({ queryKey: ['spotify'] });
  };

  return { configured, status, error, profile, connect, signOut };
}
