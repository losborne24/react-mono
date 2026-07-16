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
  thumbUrl: string;
  label: string;
}
