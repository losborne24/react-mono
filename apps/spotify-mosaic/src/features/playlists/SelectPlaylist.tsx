import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import * as constants from '@org/spotify-api';
import {
  fetchPlaylistTracks,
  fetchTopTracks,
  fetchUserPlaylists,
  searchPublicPlaylists,
  TracksResult,
} from '@org/spotify-api';
import { Playlist as PlaylistModel } from '@org/models';
import { useSession } from '@org/session';
import Loading from '../../components/Loading';

const playlistImageSx = { maxHeight: '14vw', maxWidth: '14vw' };
const swiperSlideSx = {
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'column',
  cursor: 'pointer',
};
const txtFlexSx = {
  display: 'flex',
  justifyContent: 'center',
  textAlign: 'center',
  alignItems: 'center',
};

const yourTopTrackStrings = [
  { id: 'short_term', text: 'Short Term' },
  { id: 'medium_term', text: 'Medium Term' },
  { id: 'long_term', text: 'Long Term' },
];

const Playlist = () => {
  const navigate = useNavigate();
  const { setTracks, setUniqueItems, setFetchMoreUrl, returnToMosaic } =
    useSession();
  const [personalPlaylists, setPersonalPlaylists] = useState<PlaylistModel[]>(
    []
  );
  const [isLoadingPersonalPlaylists, setIsLoadingPersonalPlaylists] =
    useState<boolean>(true);
  const [isLoadingPublicPlaylists, setIsLoadingPublicPlaylists] =
    useState<boolean>(true);
  const [publicPlaylists, setPublicPlaylists] = useState<PlaylistModel[]>([]);
  const [inputPlaylistId, setInputPlaylistId] = useState<string>('');
  const [offsetPlaylists, setOffsetPlaylists] = useState<number>(0);
  const [isLoadMorePlaylists, setLoadMorePlaylists] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load the public set (Search API) and the user's first page on mount.
  useEffect(() => {
    searchPublicPlaylists()
      .then(setPublicPlaylists)
      .catch(() => setError('Could not load public playlists.'))
      .finally(() => setIsLoadingPublicPlaylists(false));
    loadUserPlaylists(0);
  }, []);

  const loadUserPlaylists = (offset: number) => {
    fetchUserPlaylists(offset)
      .then(({ playlists, total }) => {
        setLoadMorePlaylists(offset + constants.playlists_page_size < total);
        setOffsetPlaylists(offset + constants.playlists_page_size);
        setPersonalPlaylists((prev) => [...prev, ...playlists]);
      })
      .catch(() => setError('Could not load your playlists.'))
      .finally(() => setIsLoadingPersonalPlaylists(false));
  };

  // Shared handling once a track set is fetched: store it and navigate on.
  const applyTracks = (result: TracksResult) => {
    setTracks(result.tracks);
    setUniqueItems(result.uniqueItems);
    setFetchMoreUrl(result.fetchMoreUrl);
    navigate(
      returnToMosaic ? constants.create_mosaic_url : constants.select_image_url
    );
  };

  const onSelectPlaylist = (id: string) => {
    fetchPlaylistTracks(id)
      .then(applyTracks)
      .catch(() => setError('Could not load tracks for that playlist.'));
  };

  const onSelectTopTracks = (timeRange: string) => {
    fetchTopTracks(timeRange)
      .then(applyTracks)
      .catch(() => setError('Could not load your top tracks.'));
  };

  return isLoadingPersonalPlaylists || isLoadingPublicPlaylists ? (
    <Loading />
  ) : (
        <>
          {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}
          <Box
            sx={{
              display: 'flex',
              width: '100%',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Box
              sx={{
                flexDirection: 'column',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '83%',
              }}
            >
              <h2>Public Playlists</h2>
              <Swiper
                modules={[Navigation]}
                slidesPerView={5}
                navigation={true}
                style={{ width: '100%' }}
              >
                {publicPlaylists.map((item, index) => (
                  <SwiperSlide
                    key={`swiper-slider-${index} `}
                    onClick={() => setInputPlaylistId(item.id)}
                  >
                    <Box sx={swiperSlideSx}>
                      <Box
                        component="img"
                        sx={playlistImageSx}
                        src={item.img}
                        alt="album cover"
                      />
                      <Box component="p" sx={txtFlexSx}>
                        {item.name}
                      </Box>
                    </Box>
                  </SwiperSlide>
                ))}
              </Swiper>
            </Box>
            <Box
              sx={{
                flexDirection: 'column',
                display: 'flex',
                justifyContent: 'center',
                textAlign: 'center',
                alignItems: 'center',
                width: '17%',
                height: '100%',
              }}
            >
              <h2>Your Top Tracks</h2>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  flexDirection: 'column',
                  height: '100%',
                }}
              >
                {yourTopTrackStrings.map((item) => (
                  <Button
                    key={item.id}
                    sx={{ width: '100%', m: '0.5rem' }}
                    variant="contained"
                    color="primary"
                    onClick={() => onSelectTopTracks(item.id)}
                  >
                    {item.text}
                  </Button>
                ))}
              </Box>
            </Box>
          </Box>
          <h2>Your Playlists</h2>
          <Swiper
            modules={[Navigation]}
            slidesPerView={6}
            navigation={true}
            style={{ width: '100%' }}
          >
            {personalPlaylists.map((item, index) => (
              <SwiperSlide
                key={`swiper-slider-${index} `}
                onClick={() => setInputPlaylistId(item.id)}
              >
                <Box sx={swiperSlideSx}>
                  <Box
                    component="img"
                    sx={playlistImageSx}
                    src={item.img}
                    alt="album cover"
                  />
                  <Box component="p" sx={txtFlexSx}>
                    {item.name}
                  </Box>
                </Box>
              </SwiperSlide>
            ))}
            {isLoadMorePlaylists ? (
              <SwiperSlide onClick={() => loadUserPlaylists(offsetPlaylists)}>
                <Box sx={swiperSlideSx}>
                  <Box
                    sx={{
                      ...txtFlexSx,
                      border: '0.1rem solid black',
                      height: '14vw',
                      width: '14vw',
                    }}
                  >
                    <p>Load More</p>
                  </Box>
                </Box>
              </SwiperSlide>
            ) : null}
          </Swiper>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
            }}
          >
            <TextField
              label="Enter Playlist ID"
              helperText="e.g. 37i9dQZEVXbNG2KDcFcKOF"
              onChange={(e) => setInputPlaylistId(e.target.value)}
              sx={{ mr: '0.5rem', flexBasis: '50%' }}
              value={inputPlaylistId}
            />
            <Button
              sx={{ ml: '0.5rem' }}
              variant="contained"
              color="primary"
              onClick={() => onSelectPlaylist(inputPlaylistId)}
            >
              Confirm
            </Button>
          </Box>
        </>
  );
};
export default Playlist;
