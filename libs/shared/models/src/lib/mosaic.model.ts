export interface Playlist {
  id: string;
  title: string;
  artist: string;
  /** Release year — only present for the bundled mock albums, not live playlists. */
  year?: number;
  tracks: number;
  img: string;
}

export interface SourceImage {
  id: string;
  url: string;
  label: string;
  /** Average pixel colour as `rgb(r, g, b)`, when it could be computed. */
  color?: string;
}
