import { useEffect, useState } from 'react';
import { useStepper } from '@react-mono/shared-ui';
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

export const WIZARD_STEPS = ['connect', 'playlist', 'image', 'mosaic'] as const;

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
  selectPlaylist: (playlist: Playlist | null) => void;
  selectImage: (image: SourceImage | null) => void;
  connect: () => void;
  confirmPlaylist: () => void;
  confirmImage: () => void;
  back: () => void;
  reset: () => void;
  /** Sign out and return to the connect step to authenticate as someone else. */
  switchAccount: () => void;
}

export function useMosaifyWizard(): MosaifyWizard {
  const stepper = useStepper({ count: WIZARD_STEPS.length });
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [selectedImage, setSelectedImage] = useState<SourceImage | null>(null);

  const configured = isSpotifyConfigured();
  const [status, setStatus] = useState<AuthStatus>(configured ? 'checking' : 'unauthenticated');
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

  useEffect(() => {
    if (status === 'authenticated' && stepper.index === 0) stepper.goTo(1);
  }, [status, stepper]);

  const connect = () => {
    if (!configured) return;
    beginLogin().catch((err) =>
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed.'),
    );
  };

  const confirmPlaylist = () => {
    if (!selectedPlaylist) return;
    stepper.next();
    // Fetch the chosen playlist's album art to use as mosaic tiles.
    fetchPlaylistArtwork(selectedPlaylist.id)
      .then((art) => setTiles(art))
      .catch(() => setTiles([]));
  };

  const confirmImage = () => {
    if (selectedImage) stepper.next();
  };

  const switchAccount = () => {
    logout();
    setStatus('unauthenticated');
    setProfile(null);
    setPlaylists([]);
    setSelectedPlaylist(null);
    setSelectedImage(null);
    setTiles([]);
    setAuthError(null);
    stepper.goTo(0);
  };

  const reset = () => {
    // Start over at the first interactive step: playlist when signed in.
    stepper.goTo(status === 'authenticated' ? 1 : 0);
    setSelectedPlaylist(null);
    setSelectedImage(null);
    setTiles([]);
  };

  const back = () => {
    // Backing out of `playlist` (first post-auth step) signs out — same as
    // "switch account". Deeper steps step back one.
    if (status === 'authenticated' && stepper.index <= 1) {
      switchAccount();
      return;
    }
    stepper.back();
  };

  const step = WIZARD_STEPS[stepper.index];

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
        if (selectedImage && selectedPlaylist) {
          return { step, image: selectedImage, playlist: selectedPlaylist, tiles };
        }
        // Invariant: `mosaic` (index 3) is only reachable via confirmImage /
        // confirmPlaylist, which won't advance without the data, and reset /
        // switchAccount clear selections and index together. If this throws,
        // a step guard broke upstream — fail loud rather than mask it.
        throw new Error('[mosaify] reached `mosaic` step without selections');
      case 'connect':
      default:
        return { step: 'connect', status, configured, error: authError };
    }
  };

  return {
    step,
    view: buildView(),
    stepNumber: WIZARD_STEPS.indexOf(step) + 1,
    totalSteps: WIZARD_STEPS.length,
    profile,
    selectPlaylist: setSelectedPlaylist,
    selectImage: setSelectedImage,
    connect,
    confirmPlaylist,
    confirmImage,
    back,
    reset,
    switchAccount,
  };
}

/** Re-exported so shells can wire a logout affordance. */
export { logout };
