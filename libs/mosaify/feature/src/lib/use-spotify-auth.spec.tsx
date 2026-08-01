import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSpotifyAuth } from './use-spotify-auth';

// --- Mock seams -------------------------------------------------------------
// The whole data layer is imperative I/O (OAuth redirect, token store, network),
// so it's stubbed. The hook's own state derivation is the behaviour under test.

const dataMocks = vi.hoisted(() => ({
  beginLogin: vi.fn(),
  fetchCurrentUser: vi.fn(),
  handleRedirectCallback: vi.fn(),
  isLoggedIn: vi.fn(),
  isSpotifyConfigured: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@react-mono/mosaify-data', async (orig) => ({
  ...(await orig<typeof import('@react-mono/mosaify-data')>()),
  ...dataMocks,
}));

// --- Fixtures ---------------------------------------------------------------

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

function renderAuth() {
  const { client, wrapper } = createWrapper();
  return { client, ...renderHook(() => useSpotifyAuth(), { wrapper }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: configured, no existing session, redirect resolves to no tokens.
  dataMocks.isSpotifyConfigured.mockReturnValue(true);
  dataMocks.isLoggedIn.mockReturnValue(false);
  dataMocks.handleRedirectCallback.mockResolvedValue(null);
  dataMocks.fetchCurrentUser.mockResolvedValue({ name: 'Ada', avatar: 'http://a' });
});

// --- Configured gating ------------------------------------------------------

describe('useSpotifyAuth – configuration', () => {
  it('reports unconfigured builds and never touches the session', async () => {
    dataMocks.isSpotifyConfigured.mockReturnValue(false);
    const { result } = renderAuth();

    expect(result.current.configured).toBe(false);
    // enabled:false means the session query never runs, so status resolves
    // straight to unauthenticated rather than sticking on 'checking'.
    expect(result.current.status).toBe('unauthenticated');
    expect(dataMocks.handleRedirectCallback).not.toHaveBeenCalled();
  });

  it('connect is a no-op when unconfigured', () => {
    dataMocks.isSpotifyConfigured.mockReturnValue(false);
    const { result } = renderAuth();

    act(() => result.current.connect());

    expect(dataMocks.beginLogin).not.toHaveBeenCalled();
  });
});

// --- Session resolution -----------------------------------------------------

describe('useSpotifyAuth – session status', () => {
  it('is "checking" while the redirect/session query is pending', () => {
    dataMocks.handleRedirectCallback.mockReturnValue(new Promise(() => undefined));
    const { result } = renderAuth();

    expect(result.current.status).toBe('checking');
  });

  it('lands on unauthenticated when no tokens and no stored session', async () => {
    const { result } = renderAuth();

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.profile).toBeNull();
    // Profile is only loaded once authenticated.
    expect(dataMocks.fetchCurrentUser).not.toHaveBeenCalled();
  });

  it('authenticates when the redirect returns tokens', async () => {
    dataMocks.handleRedirectCallback.mockResolvedValue({ accessToken: 'tok' });
    const { result } = renderAuth();

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
  });

  it('authenticates from an existing session with no redirect tokens', async () => {
    dataMocks.isLoggedIn.mockReturnValue(true);
    const { result } = renderAuth();

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
  });

  it('loads the profile once authenticated', async () => {
    dataMocks.isLoggedIn.mockReturnValue(true);
    const { result } = renderAuth();

    await waitFor(() =>
      expect(result.current.profile).toEqual({ name: 'Ada', avatar: 'http://a' }),
    );
  });
});

// --- Error handling ---------------------------------------------------------

describe('useSpotifyAuth – errors', () => {
  it('surfaces a session-resolution error message', async () => {
    dataMocks.handleRedirectCallback.mockRejectedValue(new Error('bad code'));
    const { result } = renderAuth();

    await waitFor(() => expect(result.current.error).toBe('bad code'));
    expect(result.current.status).toBe('unauthenticated');
  });

  it('falls back to a generic message for a non-Error session rejection', async () => {
    dataMocks.handleRedirectCallback.mockRejectedValue('nope');
    const { result } = renderAuth();

    await waitFor(() => expect(result.current.error).toBe('Sign-in failed.'));
  });

  it('surfaces a connect() kickoff failure', async () => {
    dataMocks.beginLogin.mockRejectedValue(new Error('redirect blocked'));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    act(() => result.current.connect());

    await waitFor(() => expect(result.current.error).toBe('redirect blocked'));
  });

  it('prefers a connect error over a session error', async () => {
    dataMocks.handleRedirectCallback.mockRejectedValue(new Error('session boom'));
    dataMocks.beginLogin.mockRejectedValue(new Error('connect boom'));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.error).toBe('session boom'));

    act(() => result.current.connect());

    await waitFor(() => expect(result.current.error).toBe('connect boom'));
  });
});

// --- connect / signOut ------------------------------------------------------

describe('useSpotifyAuth – actions', () => {
  it('connect kicks off the OAuth redirect', async () => {
    dataMocks.beginLogin.mockResolvedValue(undefined);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    act(() => result.current.connect());

    expect(dataMocks.beginLogin).toHaveBeenCalledTimes(1);
  });

  it('signOut clears the session and cached account data without a refetch', async () => {
    dataMocks.isLoggedIn.mockReturnValue(true);
    const { result, client } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    const removeSpy = vi.spyOn(client, 'removeQueries');

    act(() => result.current.signOut());

    expect(dataMocks.logout).toHaveBeenCalledTimes(1);
    // Session flipped in-cache to false → back to unauthenticated, no refetch.
    expect(client.getQueryData(['spotify-session'])).toBe(false);
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    // Only one redirect resolution ever ran.
    expect(dataMocks.handleRedirectCallback).toHaveBeenCalledTimes(1);
    // Cached Spotify account data is dropped so a re-login can't leak it.
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: ['spotify'] });
  });

  it('signOut clears a prior connect error', async () => {
    dataMocks.beginLogin.mockRejectedValue(new Error('connect boom'));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    act(() => result.current.connect());
    await waitFor(() => expect(result.current.error).toBe('connect boom'));

    act(() => result.current.signOut());

    expect(result.current.error).toBeNull();
  });
});
