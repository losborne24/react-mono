import type { Playlist, SourceImage } from '@react-mono/models';
import { spotifyGet } from './client';
import { averageColor } from './average-color';
import type {
  SpotifyPaged,
  SpotifyPlaylistSummary,
  SpotifyPlaylistTrack,
  SpotifyUser,
} from './types';

/** Largest available image URL, or a fallback placeholder. */
function pickImage(images: { url: string }[] | undefined): string {
  return images?.[0]?.url ?? '';
}

function toPlaylist(p: SpotifyPlaylistSummary): Playlist {
  return {
    id: p.id,
    title: p.name,
    artist: p.owner.display_name ?? 'Spotify',
    // Spotify playlists have no single release year; omit it.
    tracks: p.tracks.total,
    img: pickImage(p.images),
  };
}

/** Logged-in user's display name for the "Connected as" badge. */
export async function fetchCurrentUser(): Promise<{
  name: string;
  avatar: string | null;
}> {
  const me = await spotifyGet<SpotifyUser>('/me');
  return {
    name: me.display_name ?? me.id,
    avatar: me.images?.[0]?.url ?? null,
  };
}

/** The user's own playlists. Primary, reliable data source. */
export async function fetchUserPlaylists(limit = 40): Promise<Playlist[]> {
  const page = await spotifyGet<SpotifyPaged<SpotifyPlaylistSummary>>(
    `/me/playlists?limit=${limit}`,
  );
  return page.items.filter(Boolean).map(toPlaylist);
}

/** A single playlist by id. */
export async function fetchPlaylist(playlistId: string): Promise<Playlist> {
  const p = await spotifyGet<SpotifyPlaylistSummary>(
    `/playlists/${playlistId}?fields=id,name,images,owner(display_name),tracks(total)`,
  );
  return toPlaylist(p);
}

/**
 * Public playlists matching a search query. Replaces the deprecated
 * /browse/featured-playlists endpoint. Best-effort: on any failure we return
 * an empty list rather than erroring.
 */
export async function fetchSearchPlaylists(query: string, limit = 8): Promise<Playlist[]> {
  if (!query.trim()) return [];
  try {
    const res = await spotifyGet<{
      playlists: SpotifyPaged<SpotifyPlaylistSummary>;
    }>(`/search?q=${encodeURIComponent(query)}&type=playlist&limit=${limit}`);
    return res.playlists.items.filter(Boolean).map(toPlaylist);
  } catch {
    return [];
  }
}

/** Per-request maximum imposed by Spotify's playlist-tracks endpoint. */
export const ARTWORK_PAGE_SIZE = 100;

/**
 * One page of album artwork for a playlist — the mosaic tiles. Returns the
 * page's tiles plus the `next` cursor (null when exhausted), so callers can
 * page incrementally (e.g. `useInfiniteQuery`) and render each page as it
 * lands rather than waiting for the whole playlist. Omit `cursor` for the
 * first page; pass the previous page's `next` for subsequent ones.
 *
 * Empty-URL entries are dropped and each tile is tagged with its average pixel
 * colour (best-effort; omitted when it can't be read). Duplicate URLs within
 * the page are collapsed; cross-page dedup is the caller's concern (the query
 * function stays pure, so dedup can't rely on mutable state carried between
 * calls).
 */
export async function fetchPlaylistArtworkPage(
  playlistId: string,
  cursor?: string | null,
): Promise<{ items: SourceImage[]; next: string | null }> {
  const url =
    cursor ??
    `/playlists/${playlistId}/tracks?limit=${ARTWORK_PAGE_SIZE}&fields=items(track(album(images))),next`;
  const page = await spotifyGet<SpotifyPaged<SpotifyPlaylistTrack>>(url);

  const seen = new Set<string>();
  const colorJobs: Promise<SourceImage>[] = [];
  for (const item of page.items) {
    const url = pickImage(item.track?.album?.images);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const cover: SourceImage = { id: url, url, label: 'Album art' };
    colorJobs.push(averageColor(url).then((c) => (c ? { ...cover, color: c } : cover)));
  }

  return { items: await Promise.all(colorJobs), next: page.next };
}
