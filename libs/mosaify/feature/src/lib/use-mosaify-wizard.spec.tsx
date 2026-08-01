import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Playlist, SourceImage } from '@react-mono/models';
import { useMosaifyWizard } from './use-mosaify-wizard';
import type { AuthStatus, SpotifyAuth } from './use-spotify-auth';

// --- Mock seams -------------------------------------------------------------
// Only the async data layer, auth, and the debounce are stubbed. The real
// `useStepper` (navigation state machine) and `extractPlaylistId` (pure) run,
// since they're the behaviour under test.

const dataMocks = vi.hoisted(() => ({
  fetchUserPlaylists: vi.fn(),
  fetchSearchPlaylists: vi.fn(),
  fetchPlaylist: vi.fn(),
  fetchPlaylistArtworkPage: vi.fn(),
}));

vi.mock('@react-mono/mosaify-data', async (orig) => ({
  ...(await orig<typeof import('@react-mono/mosaify-data')>()),
  ...dataMocks,
}));

// Collapse the 350ms search debounce to a pass-through so search-driven state
// is synchronous. `useStepper` stays real.
vi.mock('@react-mono/shared-ui', async (orig) => ({
  ...(await orig<typeof import('@react-mono/shared-ui')>()),
  useDebounced: <T,>(value: T) => value,
}));

// Always assigned in beforeEach; typed non-null so tests can read it directly.
const authRef = vi.hoisted(() => ({ current: null as unknown as SpotifyAuth }));
vi.mock('./use-spotify-auth', () => ({
  useSpotifyAuth: () => authRef.current,
}));

// --- Fixtures ---------------------------------------------------------------

function makeAuth(status: AuthStatus, overrides: Partial<SpotifyAuth> = {}): SpotifyAuth {
  return {
    configured: true,
    status,
    error: null,
    profile: status === 'authenticated' ? { name: 'Ada', avatar: null } : null,
    connect: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };
}

const PL = (id: string, over: Partial<Playlist> = {}): Playlist => ({
  id,
  title: `Playlist ${id}`,
  artist: 'Various',
  tracks: 3,
  img: `http://img/${id}`,
  ...over,
});

const COVER = (url: string): SourceImage => ({ id: url, url, label: url });

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function renderWizard() {
  return renderHook(() => useMosaifyWizard(), { wrapper: createWrapper() });
}

/** Render already signed in and settled on the first interactive step. */
async function renderAuthed() {
  authRef.current = makeAuth('authenticated');
  const utils = renderWizard();
  await waitFor(() => expect(utils.result.current.step).toBe('playlist'));
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
  authRef.current = makeAuth('unauthenticated');
  dataMocks.fetchUserPlaylists.mockResolvedValue([]);
  dataMocks.fetchSearchPlaylists.mockResolvedValue([]);
  dataMocks.fetchPlaylist.mockResolvedValue(null);
  dataMocks.fetchPlaylistArtworkPage.mockResolvedValue({ items: [], next: undefined });
});

// --- Navigation state machine ----------------------------------------------

describe('useMosaifyWizard – navigation', () => {
  it('starts on the connect step when unauthenticated', () => {
    authRef.current = makeAuth('unauthenticated', { error: 'boom' });
    const { result } = renderWizard();
    expect(result.current.step).toBe('connect');
    expect(result.current.view).toMatchObject({
      step: 'connect',
      status: 'unauthenticated',
      configured: true,
      error: 'boom',
    });
    // No "back" is offered on the very first step.
    expect(result.current.back).toBeUndefined();
  });

  it('auto-advances from connect to playlist once authenticated', async () => {
    const { result, rerender } = renderWizard();
    expect(result.current.step).toBe('connect');

    authRef.current = makeAuth('authenticated');
    rerender();

    await waitFor(() => expect(result.current.step).toBe('playlist'));
  });

  it('confirmPlaylist only advances to the image step with a selection', async () => {
    const { result } = await renderAuthed();

    act(() => result.current.handlers.confirmPlaylist());
    expect(result.current.step).toBe('playlist'); // no selection → no-op

    act(() => result.current.handlers.selectPlaylist(PL('a')));
    act(() => result.current.handlers.confirmPlaylist());
    expect(result.current.step).toBe('image');
  });

  it('back from a deep step returns to the previous step', async () => {
    const { result } = await renderAuthed();
    act(() => result.current.handlers.selectPlaylist(PL('a')));
    act(() => result.current.handlers.confirmPlaylist());
    expect(result.current.step).toBe('image');

    act(() => result.current.back?.());
    expect(result.current.step).toBe('playlist');
  });

  it('back from the playlist step signs out (switch account)', async () => {
    const { result } = await renderAuthed();
    const { signOut } = authRef.current;

    act(() => result.current.back?.());

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('switchAccount clears selections and delegates sign-out', async () => {
    const { result } = await renderAuthed();
    const { signOut } = authRef.current;
    act(() => result.current.handlers.selectPlaylist(PL('a')));

    act(() => result.current.switchAccount());

    expect(signOut).toHaveBeenCalledTimes(1);
    // Auth is still 'authenticated' in the mock, so the auto-advance effect
    // bounces back to playlist — but with the selection cleared.
    await waitFor(() =>
      expect(result.current.view).toMatchObject({ step: 'playlist', selected: null }),
    );
  });

  it('reset returns to the playlist step and clears the selection', async () => {
    const { result } = await renderAuthed();
    act(() => result.current.handlers.selectPlaylist(PL('a')));
    act(() => result.current.handlers.confirmPlaylist());
    expect(result.current.step).toBe('image');

    act(() => result.current.handlers.reset());

    expect(result.current.step).toBe('playlist');
    expect(result.current.view).toMatchObject({ step: 'playlist', selected: null });
  });
});

// --- Playlist browsing ------------------------------------------------------

describe('useMosaifyWizard – playlist browser', () => {
  it('shows the user’s own playlists by default', async () => {
    dataMocks.fetchUserPlaylists.mockResolvedValue([PL('mine-1'), PL('mine-2')]);
    const { result } = await renderAuthed();

    await waitFor(() =>
      expect(result.current.view).toMatchObject({ step: 'playlist', loading: false }),
    );
    const view = result.current.view;
    expect(view.step === 'playlist' && view.playlists.map((p) => p.id)).toEqual([
      'mine-1',
      'mine-2',
    ]);
    expect(dataMocks.fetchSearchPlaylists).not.toHaveBeenCalled();
  });

  it('replaces the grid with search results once a query is typed', async () => {
    dataMocks.fetchUserPlaylists.mockResolvedValue([PL('mine-1')]);
    dataMocks.fetchSearchPlaylists.mockResolvedValue([PL('found-1')]);
    const { result } = await renderAuthed();

    act(() => result.current.handlers.setPlaylistSearch('jazz'));

    await waitFor(() => {
      const view = result.current.view;
      expect(view.step === 'playlist' && view.playlists.map((p) => p.id)).toEqual(['found-1']);
    });
    expect(dataMocks.fetchSearchPlaylists).toHaveBeenCalledWith('jazz');
  });

  it('pins a direct URL/id hit ahead of the text results', async () => {
    dataMocks.fetchPlaylist.mockResolvedValue(PL('abc'));
    dataMocks.fetchSearchPlaylists.mockResolvedValue([PL('other')]);
    const { result } = await renderAuthed();

    act(() =>
      result.current.handlers.setPlaylistSearch('https://open.spotify.com/playlist/abc'),
    );

    await waitFor(() => {
      const view = result.current.view;
      expect(view.step === 'playlist' && view.playlists.map((p) => p.id)).toEqual([
        'abc',
        'other',
      ]);
    });
    expect(dataMocks.fetchPlaylist).toHaveBeenCalledWith('abc');
  });

  it('does not duplicate a direct hit already present in the search results', async () => {
    dataMocks.fetchPlaylist.mockResolvedValue(PL('abc'));
    dataMocks.fetchSearchPlaylists.mockResolvedValue([PL('abc'), PL('other')]);
    const { result } = await renderAuthed();

    act(() =>
      result.current.handlers.setPlaylistSearch('https://open.spotify.com/playlist/abc'),
    );

    await waitFor(() => {
      const view = result.current.view;
      expect(view.step === 'playlist' && view.playlists.map((p) => p.id)).toEqual([
        'abc',
        'other',
      ]);
    });
  });
});

// --- Artwork gating & mosaic hand-off ---------------------------------------

describe('useMosaifyWizard – artwork gating', () => {
  async function toImageStep(result: { current: ReturnType<typeof useMosaifyWizard> }) {
    act(() => result.current.handlers.selectPlaylist(PL('a', { tracks: 2 })));
    act(() => result.current.handlers.confirmPlaylist());
    expect(result.current.step).toBe('image');
  }

  it('holds on the image step while covers are still loading', async () => {
    // A never-settling artwork fetch keeps trackCoversLoading true.
    dataMocks.fetchPlaylistArtworkPage.mockReturnValue(new Promise(() => undefined));
    const { result } = await renderAuthed();
    await toImageStep(result);

    act(() => result.current.handlers.selectImage({ id: 'i', url: 'i', label: 'i' }));
    act(() => result.current.handlers.confirmImage());

    expect(result.current.step).toBe('image');
    expect(result.current.view).toMatchObject({ step: 'image', trackCoversLoading: true });
  });

  it('advances to mosaic with deduped covers once artwork settles', async () => {
    dataMocks.fetchPlaylistArtworkPage.mockResolvedValue({
      items: [COVER('x'), COVER('x'), COVER('y')], // duplicate url
      next: undefined,
    });
    const { result } = await renderAuthed();
    await toImageStep(result);

    await waitFor(() =>
      expect(result.current.view).toMatchObject({ step: 'image', trackCoversLoading: false }),
    );

    const image = { id: 'i', url: 'i', label: 'i' };
    act(() => result.current.handlers.selectImage(image));
    act(() => result.current.handlers.confirmImage());

    expect(result.current.step).toBe('mosaic');
    const view = result.current.view;
    expect(view.step === 'mosaic' && view.trackCovers.map((c) => c.url)).toEqual(['x', 'y']);
    expect(view.step === 'mosaic' && view.image).toBe(image);
    expect(view.step === 'mosaic' && view.playlist.id).toBe('a');
  });
});
