export interface Album {
  id: string;
  title: string;
  artist: string;
  year: number;
  tracks: number;
  img: string;
}

export interface PickableImage {
  id: string;
  url: string;
  thumbUrl: string;
  label: string;
}
