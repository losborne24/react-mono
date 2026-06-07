// Typed Spotify Web API client. Owns auth-header injection, 401 refresh-retry,
// and the track -> {id,img,avgColour} reduction (dedupe by album + colour
// extraction) that the UI consumes.
import axios, { AxiosRequestConfig } from 'axios';
import { FastAverageColor } from 'fast-average-color';
import * as constants from './constants.js';
import {
  Playlist,
  SpotifyPlaylistItem,
  SpotifyPlaylistTrackItem,
  SpotifyTopTrackItem,
  Track,
} from '@org/models';
import { clearTokens, getValidAccessToken, refreshTokens } from './auth.js';

const API = 'https://api.spotify.com/v1';

// Single axios instance. Request interceptor attaches a fresh access token;
// response interceptor refreshes once on 401 and replays the request.
const client = axios.create({ baseURL: API });

client.interceptors.request.use(async (config) => {
  const token = await getValidAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as AxiosRequestConfig & { _retried?: boolean };
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      const refreshed = await refreshTokens();
      if (refreshed) {
        original.headers = original.headers ?? {};
        (original.headers as any).Authorization = `Bearer ${refreshed.accessToken}`;
        return client(original);
      }
      clearTokens();
    }
    return Promise.reject(error);
  }
);

// ---- Playlists ----

function toPlaylist(item: SpotifyPlaylistItem): Playlist | null {
  if (!item || !item.images?.length) return null;
  return { id: item.id, name: item.name, img: item.images[0].url };
}

// Spotify deprecated browse/categories playlists (404s), so the public set
// comes from the Search API.
export async function searchPublicPlaylists(): Promise<Playlist[]> {
  const res = await client.get('/search', {
    params: {
      q: 'top hits',
      type: 'playlist',
      limit: constants.playlists_page_size,
      offset: 0,
    },
  });
  const items: SpotifyPlaylistItem[] = res.data?.playlists?.items ?? [];
  return items.map(toPlaylist).filter((p): p is Playlist => p !== null);
}

export interface UserPlaylistsPage {
  playlists: Playlist[];
  total: number;
}

export async function fetchUserPlaylists(
  offset: number
): Promise<UserPlaylistsPage> {
  const res = await client.get('/me/playlists', {
    params: {
      fields: 'items(name,images,id),total',
      limit: constants.playlists_page_size,
      offset,
    },
  });
  const items: SpotifyPlaylistItem[] = res.data?.items ?? [];
  return {
    playlists: items.map(toPlaylist).filter((p): p is Playlist => p !== null),
    total: res.data?.total ?? 0,
  };
}

// ---- Tracks ----

export interface TracksResult {
  tracks: Track[];
  uniqueItems: any[]; // raw items, kept for paginated "fetch more"
  fetchMoreUrl: string | null;
}

// Reduce raw album entries to {id,img,avgColour}, deduped by album id, with the
// average colour of each 64x64 thumbnail computed once.
async function albumsToTracks(
  albums: { id: string; imgUrl: string }[]
): Promise<Track[]> {
  const fac = new FastAverageColor();
  return Promise.all(
    albums.map(async (a) => {
      const color = await fac.getColorAsync(a.imgUrl);
      return { id: a.id, img: a.imgUrl, avgColour: color.value };
    })
  );
}

function dedupeAlbums(albums: { id: string; imgUrl: string }[]) {
  const seen = new Set<string>();
  const out: { id: string; imgUrl: string }[] = [];
  for (const a of albums) {
    if (!a.id || seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

export async function fetchPlaylistTracks(
  playlistId: string
): Promise<TracksResult> {
  const url = `/playlists/${playlistId}/tracks`;
  const res = await client.get(url, {
    params: {
      fields: 'items(track(album(images,id))),total',
      limit: constants.tracks_page_size,
      offset: 0,
    },
  });
  const items: SpotifyPlaylistTrackItem[] = res.data?.items ?? [];
  const albums = dedupeAlbums(
    items
      .filter((i) => i.track?.album?.images?.[2])
      .map((i) => ({
        id: i.track!.album.id,
        imgUrl: i.track!.album.images[2].url,
      }))
  );
  return {
    tracks: await albumsToTracks(albums),
    uniqueItems: items,
    fetchMoreUrl:
      (res.data?.total ?? 0) > constants.tracks_page_size
        ? `${API}/playlists/${playlistId}/tracks`
        : null,
  };
}

export async function fetchTopTracks(timeRange: string): Promise<TracksResult> {
  const res = await client.get('/me/top/tracks', {
    params: {
      time_range: timeRange,
      limit: constants.top_tracks_page_size,
      offset: 0,
    },
  });
  const items: SpotifyTopTrackItem[] = res.data?.items ?? [];
  const albums = dedupeAlbums(
    items
      .filter((i) => i.album?.images?.[2])
      .map((i) => ({ id: i.album.id, imgUrl: i.album.images[2].url }))
  );
  return {
    tracks: await albumsToTracks(albums),
    uniqueItems: items,
    fetchMoreUrl: null,
  };
}

// Next page of a playlist's tracks (used by the mosaic's "Fetch More").
export async function fetchMorePlaylistTracks(
  fetchMoreUrl: string,
  offset: number
): Promise<{ tracks: Track[]; total: number }> {
  const res = await client.get(fetchMoreUrl, {
    params: {
      fields: 'items(track(album(images,id))),total',
      limit: 100,
      offset,
    },
  });
  const items: SpotifyPlaylistTrackItem[] = res.data?.items ?? [];
  const albums = dedupeAlbums(
    items
      .filter((i) => i.track?.album?.images?.[2])
      .map((i) => ({
        id: i.track!.album.id,
        imgUrl: i.track!.album.images[2].url,
      }))
  );
  return { tracks: await albumsToTracks(albums), total: res.data?.total ?? 0 };
}
