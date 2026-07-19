import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebounced, useStepper, type StepperStep } from '@react-mono/shared-ui';
import type { Playlist, SourceImage } from '@react-mono/models';
import {
  SAMPLE_IMAGES,
  extractPlaylistId,
  fetchPlaylist,
  fetchSearchPlaylists,
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

/**
 * The playlist grid: the user's own playlists by default, replaced by search
 * results (with any direct URL/id hit pinned first) once they type a query.
 */
function usePlaylistBrowser(
  status: AuthStatus,
  debouncedSearch: string,
): { playlists: Playlist[]; loading: boolean } {
  const authed = status === 'authenticated';

  // The user's own playlists — the default listing before any search.
  const { data: mine = [], isPending: minePending } = useQuery({
    queryKey: ['spotify', 'playlists', 'mine'],
    enabled: authed,
    queryFn: () => fetchUserPlaylists(),
  });

  // Public playlists matching the search box. Only runs with a non-empty query.
  const trimmedSearch = debouncedSearch.trim();
  const { data: found = [], isFetching: searchFetching } = useQuery({
    queryKey: ['spotify', 'playlists', 'search', trimmedSearch],
    enabled: authed && trimmedSearch.length > 0,
    queryFn: () => fetchSearchPlaylists(trimmedSearch),
  });

  // If the query is (or contains) a playlist URL/id, resolve that one directly
  // — it may be private or unlisted and never surface via text search.
  const directId = extractPlaylistId(trimmedSearch);
  const { data: direct = null } = useQuery({
    queryKey: ['spotify', 'playlist', directId],
    enabled: authed && !!directId,
    queryFn: () => fetchPlaylist(directId as string),
  });

  // Search results take over the grid when the user is searching; otherwise
  // show their own playlists. A direct id-hit is pinned first, deduped.
  const searchResults =
    direct && !found.some((p) => p.id === direct.id) ? [direct, ...found] : found;
  const playlists = trimmedSearch.length > 0 ? searchResults : mine;
  // `isPending` is true even when disabled; only surface loading while authed.
  const loading = authed && (trimmedSearch.length > 0 ? searchFetching : minePending);

  return { playlists, loading };
}

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
      search: string;
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
  setPlaylistSearch: (query: string) => void;
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
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);

  const auth = useSpotifyAuth();
  const { configured, status, profile } = auth;

  const { playlists, loading: playlistsLoading } = usePlaylistBrowser(status, debouncedSearch);

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
    setSearch('');
    stepper.goTo(0);
  };

  const reset = () => {
    // Start over at the first interactive step: playlist when signed in.
    stepper.goTo(status === 'authenticated' ? 1 : 0);
    setSelectedPlaylist(null);
    setSelectedImage(null);
    setSearch('');
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
          search,
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
    setPlaylistSearch: setSearch,
    selectImage: setSelectedImage,
    connect: auth.connect,
    confirmPlaylist,
    confirmImage,
    back: stepper.canBack ? back : undefined,
    reset,
    switchAccount,
  };
}
