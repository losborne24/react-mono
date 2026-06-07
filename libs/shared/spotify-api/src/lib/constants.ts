export const client_id = 'f1da744b65de4f5aaa1d3e3bb881d942';
export const response_type = 'code';
export const authorize_url = 'https://accounts.spotify.com/authorize';
export const token_url = 'https://accounts.spotify.com/api/token';
export const redirect_uri = import.meta.env.DEV
  ? 'http://127.0.0.1:3000/'
  : 'https://losborne24.github.io/spotify-mosaic/';
export const scopes = 'user-top-read user-read-private user-read-email';
export const code_verifier_key = 'codeVerifier';
export const playlists_page_size = 10;
export const tracks_page_size = 100;
export const top_tracks_page_size = 50;
export const create_mosaic_url = '/createMosaic';
export const select_playlist_url = '/playlists';
export const select_image_url = '/selectImage';
