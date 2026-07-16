import { useCallback, useEffect, useState } from 'react';
import type { Playlist, SourceImage } from '@react-mono/models';
import {
  SAMPLE_IMAGES,
  beginLogin,
  fetchCurrentUser,
  fetchFeaturedPlaylists,
  fetchPlaylistArtwork,
  fetchUserPlaylists,
  handleRedirectCallback,
  isLoggedIn,
  isSpotifyConfigured,
  logout,
} from '@react-mono/spotify-mosaic-data';

export const WIZARD_STEPS = [
  'connect',
  'playlist',
  'image',
  'mosaic',
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export type AuthStatus =
  | 'checking' // resolving an OAuth redirect / existing session
  | 'unauthenticated'
  | 'authenticated';

export interface SpotifyProfile {
  name: string;
  avatar: string | null;
}

/**
 * Render-ready view of the current step. The `mosaic` variant guarantees
 * non-null `image`/`playlist`, so the shell cannot render Mosaic without data.
 */
export type WizardView =
  | { step: 'connect'; status: AuthStatus; configured: boolean; error: string | null }
  | {
      step: 'playlist';
      playlists: Playlist[];
      selected: Playlist | null;
      loading: boolean;
    }
  | { step: 'image'; images: SourceImage[]; selected: SourceImage | null }
  | {
      step: 'mosaic';
      image: SourceImage;
      playlist: Playlist;
      tiles: SourceImage[];
    };

export interface MosaifyWizard {
  step: WizardStep;
  view: WizardView;
  stepNumber: number;
  totalSteps: number;
  profile: SpotifyProfile | null;
  canGoBack: boolean;
  selectPlaylist: (playlist: Playlist | null) => void;
  selectImage: (image: SourceImage | null) => void;
  connect: () => void;
  confirmPlaylist: () => void;
  confirmImage: () => void;
  back: () => void;
  reset: () => void;
}

export function useMosaifyWizard(): MosaifyWizard {
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null
  );
  const [selectedImage, setSelectedImage] = useState<SourceImage | null>(null);

  const configured = isSpotifyConfigured();
  const [status, setStatus] = useState<AuthStatus>(
    configured ? 'checking' : 'unauthenticated'
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [profile, setProfile] = useState<SpotifyProfile | null>(null);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [tiles, setTiles] = useState<SourceImage[]>([]);

  // On mount: resolve an OAuth redirect, or pick up an existing session.
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;

    (async () => {
      try {
        const tokens = await handleRedirectCallback();
        if (cancelled) return;
        if (tokens || isLoggedIn()) {
          setStatus('authenticated');
          setStepIndex(1); // skip the connect step once authenticated
        } else {
          setStatus('unauthenticated');
        }
      } catch (err) {
        if (cancelled) return;
        setAuthError(err instanceof Error ? err.message : 'Sign-in failed.');
        setStatus('unauthenticated');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configured]);

  // Load playlists once authenticated.
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    setPlaylistsLoading(true);

    (async () => {
      try {
        const [me, mine, featured] = await Promise.all([
          fetchCurrentUser(),
          fetchUserPlaylists(),
          fetchFeaturedPlaylists(),
        ]);
        if (cancelled) return;
        setProfile(me);
        // User's own playlists first, then curated; dedupe by id.
        const seen = new Set<string>();
        const merged = [...mine, ...featured].filter((p) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
        setPlaylists(merged);
      } catch {
        if (!cancelled) setPlaylists([]);
      } finally {
        if (!cancelled) setPlaylistsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  const advance = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
  }, []);

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const connect = useCallback(() => {
    if (!configured) return;
    beginLogin().catch((err) =>
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed.')
    );
  }, [configured]);

  const confirmPlaylist = useCallback(() => {
    if (!selectedPlaylist) return;
    advance();
    // Fetch the chosen playlist's album art to use as mosaic tiles.
    fetchPlaylistArtwork(selectedPlaylist.id)
      .then((art) => setTiles(art))
      .catch(() => setTiles([]));
  }, [selectedPlaylist, advance]);

  const confirmImage = useCallback(() => {
    if (selectedImage) advance();
  }, [selectedImage, advance]);

  const reset = useCallback(() => {
    setStepIndex(status === 'authenticated' ? 1 : 0);
    setSelectedPlaylist(null);
    setSelectedImage(null);
    setTiles([]);
  }, [status]);

  const step = WIZARD_STEPS[stepIndex];

  const buildView = (): WizardView => {
    switch (step) {
      case 'playlist':
        return {
          step,
          playlists,
          selected: selectedPlaylist,
          loading: playlistsLoading,
        };
      case 'image':
        return { step, images: SAMPLE_IMAGES, selected: selectedImage };
      case 'mosaic':
        // Guaranteed by confirmPlaylist/confirmImage advance guards; fall back
        // to connect if state was somehow reached without data.
        if (selectedImage && selectedPlaylist) {
          return { step, image: selectedImage, playlist: selectedPlaylist, tiles };
        }
        return { step: 'connect', status, configured, error: authError };
      case 'connect':
      default:
        return { step: 'connect', status, configured, error: authError };
    }
  };

  return {
    step,
    view: buildView(),
    stepNumber: stepIndex + 1,
    totalSteps: WIZARD_STEPS.length,
    profile,
    canGoBack: stepIndex > (status === 'authenticated' ? 1 : 0),
    selectPlaylist: setSelectedPlaylist,
    selectImage: setSelectedImage,
    connect,
    confirmPlaylist,
    confirmImage,
    back,
    reset,
  };
}

/** Re-exported so shells can wire a logout affordance. */
export { logout };
