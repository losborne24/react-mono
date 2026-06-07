import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Box from '@mui/material/Box';
import ReactGA from 'react-ga4';
import * as constants from '@org/spotify-api';
import { SessionProvider } from '@org/session';
import Playlist from '../features/playlists/SelectPlaylist';
import Mosaic from '../features/mosaic/Mosaic';
import ConnectToSpotify from '../features/auth/ConnectToSpotify';
import SelectImage from '../features/image/SelectImage';

const centerSx = {
  display: 'flex',
  justifyContent: 'center',
  flexDirection: 'column',
  alignItems: 'center',
  height: '100%',
  width: '100%',
} as const;

const App = () => {
  useEffect(() => {
    ReactGA.initialize('G-JQQCW8E695');
  }, []);
  return (
    <SessionProvider>
      <Router>
        <Routes>
          <Route
            path={constants.select_playlist_url}
            element={
              <Box sx={centerSx}>
                <Playlist />
              </Box>
            }
          />
          <Route
            path={constants.select_image_url}
            element={
              <Box sx={centerSx}>
                <SelectImage />
              </Box>
            }
          />
          <Route path={constants.create_mosaic_url} element={<Mosaic />} />
          <Route
            path="/"
            element={
              <Box sx={centerSx}>
                <ConnectToSpotify />
              </Box>
            }
          />
          {/* Spotify PKCE redirect lands on `/?code=...&state=...` (query, no
              hash), so HashRouter renders the `/` route (ConnectToSpotify),
              which performs the token exchange. Catch-all guards stray paths. */}
          <Route
            path="*"
            element={
              <Box sx={centerSx}>
                <Playlist />
              </Box>
            }
          />
        </Routes>
      </Router>
    </SessionProvider>
  );
};

export default App;
