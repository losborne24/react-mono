import { beforeEach, vi } from 'vitest';
import {
  ARTWORK_PAGE_SIZE,
  fetchPlaylist,
  fetchPlaylistArtworkPage,
  fetchSearchPlaylists,
  fetchUserPlaylists,
} from './endpoints';

// Collaborators are mocked so these tests exercise only the transform/paging
// logic in endpoints.ts, not the network or canvas.
const spotifyGet = vi.fn();
const averageColor = vi.fn();

vi.mock('./client', () => ({
  spotifyGet: (path: string) => spotifyGet(path),
}));
vi.mock('@react-mono/mosaify-util', () => ({
  averageColor: (url: string) => averageColor(url),
}));

const summary = {
  id: 'p1',
  name: 'Road Trip',
  images: [{ url: 'https://img/large' }, { url: 'https://img/small' }],
  owner: { display_name: 'Ada' },
  tracks: { total: 42 },
};

beforeEach(() => {
  vi.clearAllMocks();
  averageColor.mockResolvedValue(null);
});

describe('toPlaylist (via fetchPlaylist)', () => {
  it('maps a Spotify summary to the app Playlist shape', async () => {
    spotifyGet.mockResolvedValue(summary);
    await expect(fetchPlaylist('p1')).resolves.toEqual({
      id: 'p1',
      title: 'Road Trip',
      artist: 'Ada',
      tracks: 42,
      img: 'https://img/large',
    });
  });

  it('falls back to "Spotify" when the owner has no display name', async () => {
    spotifyGet.mockResolvedValue({ ...summary, owner: { display_name: null } });
    await expect(fetchPlaylist('p1')).resolves.toMatchObject({ artist: 'Spotify' });
  });

  it('falls back to an empty img when there are no images', async () => {
    spotifyGet.mockResolvedValue({ ...summary, images: [] });
    await expect(fetchPlaylist('p1')).resolves.toMatchObject({ img: '' });
  });
});

describe('fetchUserPlaylists', () => {
  it('drops null items Spotify occasionally returns', async () => {
    spotifyGet.mockResolvedValue({ items: [summary, null], next: null, total: 2 });
    const result = await fetchUserPlaylists();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });
});

describe('fetchSearchPlaylists', () => {
  it('short-circuits to [] for a blank query without hitting the API', async () => {
    await expect(fetchSearchPlaylists('   ')).resolves.toEqual([]);
    expect(spotifyGet).not.toHaveBeenCalled();
  });

  it('unwraps the nested playlists page', async () => {
    spotifyGet.mockResolvedValue({
      playlists: { items: [summary], next: null, total: 1 },
    });
    const result = await fetchSearchPlaylists('road');
    expect(result).toHaveLength(1);
    expect(spotifyGet).toHaveBeenCalledWith(expect.stringContaining('q=road'));
  });

  it('is best-effort: returns [] when the request throws', async () => {
    spotifyGet.mockRejectedValue(new Error('boom'));
    await expect(fetchSearchPlaylists('road')).resolves.toEqual([]);
  });
});

describe('fetchPlaylistArtworkPage', () => {
  const trackWith = (url: string) => ({ track: { album: { images: [{ url }] } } });

  it('requests the first page with the page-size limit when no cursor is given', async () => {
    spotifyGet.mockResolvedValue({ items: [], next: null, total: 0 });
    await fetchPlaylistArtworkPage('p1');
    expect(spotifyGet).toHaveBeenCalledWith(expect.stringContaining(`limit=${ARTWORK_PAGE_SIZE}`));
  });

  it('follows the cursor verbatim for subsequent pages', async () => {
    spotifyGet.mockResolvedValue({ items: [], next: null, total: 0 });
    await fetchPlaylistArtworkPage('p1', 'https://api.spotify.com/next-page');
    expect(spotifyGet).toHaveBeenCalledWith('https://api.spotify.com/next-page');
  });

  it('drops empty-URL tiles and collapses duplicates within the page', async () => {
    spotifyGet.mockResolvedValue({
      items: [
        trackWith('https://art/a'),
        trackWith('https://art/a'), // dup
        trackWith(''), // empty
        { track: null }, // missing track
        trackWith('https://art/b'),
      ],
      next: null,
      total: 5,
    });
    const { items } = await fetchPlaylistArtworkPage('p1');
    expect(items.map((i) => i.url)).toEqual(['https://art/a', 'https://art/b']);
  });

  it('tags a tile with its average colour when available', async () => {
    const color = 'rgb(10, 20, 30)';
    averageColor.mockResolvedValue(color);
    spotifyGet.mockResolvedValue({
      items: [trackWith('https://art/a')],
      next: null,
      total: 1,
    });
    const { items } = await fetchPlaylistArtworkPage('p1');
    expect(items[0]).toMatchObject({ url: 'https://art/a', color });
  });

  it('omits colour (best-effort) when it cannot be read', async () => {
    averageColor.mockResolvedValue(null);
    spotifyGet.mockResolvedValue({
      items: [trackWith('https://art/a')],
      next: null,
      total: 1,
    });
    const { items } = await fetchPlaylistArtworkPage('p1');
    expect(items[0].color).toBeUndefined();
  });

  it('passes the page cursor back to the caller', async () => {
    spotifyGet.mockResolvedValue({ items: [], next: 'CURSOR', total: 0 });
    const { next } = await fetchPlaylistArtworkPage('p1');
    expect(next).toBe('CURSOR');
  });
});
