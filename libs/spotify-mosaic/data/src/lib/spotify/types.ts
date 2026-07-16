/** Minimal shapes of the Spotify Web API responses we consume. */

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyUser {
  id: string;
  display_name: string | null;
  images?: SpotifyImage[];
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  images: SpotifyImage[];
  owner: { display_name: string | null };
  tracks: { total: number };
}

export interface SpotifyPaged<T> {
  items: T[];
  next: string | null;
  total: number;
}

export interface SpotifyPlaylistTrack {
  track: {
    album?: { images: SpotifyImage[] };
  } | null;
}
