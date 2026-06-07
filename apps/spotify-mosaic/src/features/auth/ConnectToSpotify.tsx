import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import ScrollContainer from 'react-indiana-drag-scroll';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as constants from '@org/spotify-api';
import { beginLogin, completeLogin } from '@org/spotify-api';
import spotifyMosaicImg from '../../assets/spotify.png';

// True the moment we land back from Spotify, before the async token exchange.
const isReturningFromSpotify = () =>
  new URLSearchParams(window.location.search).has('code');

const ConnectToSpotify = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // Start in the "connecting" state if we already have a `?code` to exchange,
  // so the button never shows during the async exchange (avoids a double-click).
  const [isConnecting, setIsConnecting] = useState<boolean>(
    isReturningFromSpotify
  );

  // On return from Spotify (`?code=...&state=...`), exchange the code for
  // tokens and continue to the playlist picker.
  useEffect(() => {
    if (!isReturningFromSpotify()) return;
    completeLogin()
      .then((tokens) => {
        // Strip the consumed `?code` so a reload can't re-trigger the exchange.
        window.history.replaceState({}, '', window.location.pathname);
        if (tokens) {
          navigate(constants.select_playlist_url);
        } else {
          setIsConnecting(false);
          setError('Login failed. Please try again.');
        }
      })
      .catch(() => {
        window.history.replaceState({}, '', window.location.pathname);
        setIsConnecting(false);
        setError('Login failed. Please try again.');
      });
  }, [navigate]);

  return (
    <>
      <h1>Spotify Mosaic</h1>
      <ScrollContainer
        style={{
          maxHeight: '80%',
          maxWidth: '70%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={spotifyMosaicImg}
          style={{ height: '100vh', width: '100vh' }}
          alt="Spotify Mosaic"
        />
      </ScrollContainer>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {isConnecting ? (
        <CircularProgress sx={{ m: '2rem' }} />
      ) : (
        <Button
          variant="contained"
          color="primary"
          onClick={() => beginLogin()}
          sx={{ m: '2rem' }}
        >
          Connect to Spotify
        </Button>
      )}
    </>
  );
};
export default ConnectToSpotify;
