// Shared domain types.

// A track reduced to what the mosaic needs: album id, thumbnail url, and the
// average colour of that thumbnail ([r,g,b,a], 0-255). avgColour is null only
// for the seed placeholder before any playlist is loaded.
export interface Track {
  id: string;
  img: string;
  avgColour: number[] | null;
}

// A playlist as shown in the picker.
export interface Playlist {
  id: string;
  name: string;
  img: string;
}

export enum PlaylistSource {
  public = 'public',
  personal = 'personal',
}

export enum TrackSource {
  playlist = 'playlist',
  top = 'top',
}

// Tokens persisted from the PKCE exchange / refresh.
export interface AuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // epoch ms
}

// ---- Minimal Spotify Web API response shapes (only fields we read) ----

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyAlbum {
  id: string;
  images: SpotifyImage[];
}

// /playlists/{id}/tracks items wrap the track under `.track`.
export interface SpotifyPlaylistTrackItem {
  track: { album: SpotifyAlbum } | null;
}

// /me/top/tracks items are tracks directly (album at top level).
export interface SpotifyTopTrackItem {
  album: SpotifyAlbum;
}

export interface SpotifyPlaylistItem {
  id: string;
  name: string;
  images: SpotifyImage[];
}
