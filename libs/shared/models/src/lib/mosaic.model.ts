export interface Playlist {
  id: string;
  title: string;
  artist: string;
  year: number;
  tracks: number;
  img: string;
}

export interface SourceImage {
  id: string;
  url: string;
  thumbUrl: string;
  label: string;
}
