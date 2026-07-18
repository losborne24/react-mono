import type { Playlist, SourceImage } from '@react-mono/models';
import { spotifyGet } from './client';
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
export async function fetchUserPlaylists(limit = 50): Promise<Playlist[]> {
  const page = await spotifyGet<SpotifyPaged<SpotifyPlaylistSummary>>(
    `/me/playlists?limit=${limit}`,
  );
  return page.items.filter(Boolean).map(toPlaylist);
}

/**
 * Spotify-curated/featured playlists. The /browse/featured-playlists endpoint
 * is DEPRECATED and returns 403/404 for newer apps, so this is best-effort:
 * on any failure we return an empty list rather than erroring.
 */
export async function fetchFeaturedPlaylists(limit = 8): Promise<Playlist[]> {
  try {
    const res = await spotifyGet<{
      playlists: SpotifyPaged<SpotifyPlaylistSummary>;
    }>(`/browse/featured-playlists?limit=${limit}`);
    return res.playlists.items.filter(Boolean).map(toPlaylist);
  } catch {
    return [];
  }
}

/**
 * Album artwork for a playlist's tracks — the actual mosaic tiles. Deduped,
 * empty-URL entries dropped.
 */
export async function fetchPlaylistArtwork(
  playlistId: string,
  limit = 100,
): Promise<SourceImage[]> {
  const page = await spotifyGet<SpotifyPaged<SpotifyPlaylistTrack>>(
    `/playlists/${playlistId}/tracks?limit=${limit}&fields=items(track(album(images)))`,
  );

  const seen = new Set<string>();
  const tiles: SourceImage[] = [];
  for (const item of page.items) {
    const url = pickImage(item.track?.album?.images);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    tiles.push({ id: url, url, thumbUrl: url, label: 'Album art' });
  }
  return tiles;
}
