import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStepper, type StepperStep } from '@react-mono/shared-ui';
import type { Playlist, SourceImage } from '@react-mono/models';
import {
  SAMPLE_IMAGES,
  fetchFeaturedPlaylists,
  fetchPlaylistArtwork,
  fetchUserPlaylists,
} from '@react-mono/mosaify-data';
import { useSpotifyAuth } from './use-spotify-auth';
import type { AuthStatus, SpotifyProfile } from './use-spotify-auth';

export type { AuthStatus, SpotifyProfile } from './use-spotify-auth';

/**
 * Canonical wizard step definitions — single source of truth for step ids,
 * labels, and ordering. `WIZARD_STEPS` (id union) and `WIZARD_STEP_INDICATORS`
 * (display shape for the UI indicator) both derive from this.
 */
export const WIZARD_STEP_DEFS = [
  { id: 'connect', label: 'Connect' },
  { id: 'playlist', label: 'Playlist' },
  { id: 'image', label: 'Image' },
  { id: 'mosaic', label: 'Mosaic' },
] as const;

export const WIZARD_STEPS = WIZARD_STEP_DEFS.map((s) => s.id);

export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Display steps for the UI `WizardLayout` / `Stepper`. */
export const WIZARD_STEP_INDICATORS: StepperStep[] = WIZARD_STEP_DEFS.map((s) => ({
  label: s.label,
}));

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
  /** Go to the previous step, or `undefined` when back isn't offered. */
  back: (() => void) | undefined;
  reset: () => void;
  /** Sign out and return to the connect step to authenticate as someone else. */
  switchAccount: () => void;
}

export function useMosaifyWizard(): MosaifyWizard {
  const stepper = useStepper({ count: WIZARD_STEPS.length });
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [selectedImage, setSelectedImage] = useState<SourceImage | null>(null);

  const auth = useSpotifyAuth();
  const { configured, status, profile } = auth;

  // Load playlists once authenticated: user's own first, then curated, deduped.
  const { data: playlists = [], isPending: playlistsPending } = useQuery({
    queryKey: ['spotify', 'playlists'],
    enabled: status === 'authenticated',
    queryFn: async () => {
      const [mine, featured] = await Promise.all([fetchUserPlaylists(), fetchFeaturedPlaylists()]);
      const seen = new Set<string>();
      return [...mine, ...featured].filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    },
  });
  // `isPending` is true even when disabled; only surface loading while authed.
  const playlistsLoading = status === 'authenticated' && playlistsPending;

  // Album art for the chosen playlist — the mosaic tiles. Fetched on selection.
  const selectedPlaylistId = selectedPlaylist?.id;
  const { data: tiles = [] } = useQuery({
    queryKey: ['spotify', 'artwork', selectedPlaylistId],
    enabled: !!selectedPlaylistId,
    queryFn: () => fetchPlaylistArtwork(selectedPlaylistId as string),
  });

  useEffect(() => {
    if (status === 'authenticated' && stepper.index === 0) stepper.goTo(1);
  }, [status, stepper]);

  const confirmPlaylist = () => {
    if (!selectedPlaylist) return;
    // Artwork is fetched by the `tiles` query, keyed on the selected playlist.
    stepper.next();
  };

  const confirmImage = () => {
    if (selectedImage) stepper.next();
  };

  const switchAccount = () => {
    auth.signOut();
    setSelectedPlaylist(null);
    setSelectedImage(null);
    stepper.goTo(0);
  };

  const reset = () => {
    // Start over at the first interactive step: playlist when signed in.
    stepper.goTo(status === 'authenticated' ? 1 : 0);
    setSelectedPlaylist(null);
    setSelectedImage(null);
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
        return { step: 'connect', status, configured, error: auth.error };
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
    connect: auth.connect,
    confirmPlaylist,
    confirmImage,
    back: stepper.canBack ? back : undefined,
    reset,
    switchAccount,
  };
}
