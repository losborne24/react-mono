import Button from '@mui/material/Button';
import Slider from '@mui/material/Slider';
import Box from '@mui/material/Box';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ScrollContainer from 'react-indiana-drag-scroll';
import * as constants from '@org/spotify-api';
import { matchIndices, normaliseTrackColours } from '@org/mosaic-utils';
import { Track } from '@org/models';
import { fetchMorePlaylistTracks } from '@org/spotify-api';
import { useSession } from '@org/session';
import Loading from '../../components/Loading';

const TILE = 64; // album thumbnail size (Spotify images[2] is 64x64)
const MAX_PIXELS = 40000; // cap on tile count (200x200); also the source resolution

// Tracks that actually have a usable colour/image (drops the seed placeholder).
type RenderableTrack = { id: string; img: string; avgColour: number[] };

// Load each unique album image once. crossOrigin must be set before src or the
// output canvas is tainted and toDataURL/convertToBlob throws SecurityError.
function preloadTracks(
  tracks: RenderableTrack[]
): Promise<(HTMLImageElement | null)[]> {
  return Promise.all(
    tracks.map(
      (t) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const im = new Image();
          im.crossOrigin = 'anonymous';
          im.onload = () => resolve(im);
          im.onerror = () => resolve(null); // skip failed tiles, don't hang
          im.src = t.img;
        })
    )
  );
}

// Scale the source image down so tile count stays within MAX_PIXELS.
function scaledDimensions(img: HTMLImageElement): { w: number; h: number } {
  let w = img.width;
  let h = img.height;
  if (w * h > MAX_PIXELS) {
    const modifier = Math.sqrt((w * h) / MAX_PIXELS);
    w /= modifier;
    h /= modifier;
  }
  return { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
}

const Mosaic = () => {
  const {
    tracks,
    setTracks,
    imageSrc,
    fetchMoreUrl,
    setFetchMoreUrl,
    setReturnToMosaic,
  } = useSession();
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [offset, setOffset] = useState(100);
  const [isLoadingMosaic, setIsLoadingMosaic] = useState(true);
  const [selectedTrackImage, setSelectedTrackImage] = useState<string>('');
  const navigate = useNavigate();
  const [value, setValue] = useState<number>(10);
  // Track the latest object URL so we can revoke it when it's replaced.
  const objectUrlRef = useRef<string | null>(null);
  const handleChange = (_event: Event, newValue: number | number[]) => {
    setValue(newValue as number);
  };

  const fetchMoreTracks = () => {
    if (!fetchMoreUrl) return;
    fetchMorePlaylistTracks(fetchMoreUrl, offset)
      .then(({ tracks: more, total }) => {
        if (total > offset + 100) {
          setOffset(offset + 100);
        } else {
          setFetchMoreUrl(null);
        }
        // Append only album ids not already present.
        const existing = new Set(tracks.map((t) => t.id));
        const fresh = more.filter((t) => !existing.has(t.id));
        setTracks([...tracks, ...fresh]);
        setIsLoadingMosaic(true);
      })
      .catch((err: unknown) => {
        console.log(err);
      });
  };

  // Build the mosaic whenever the source image or the track set changes.
  useEffect(() => {
    if (!imageSrc) return;
    let cancelled = false;

    const setImage = (url: string) => {
      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;
      setSelectedTrackImage(url);
      setIsLoadingMosaic(false);
    };

    const run = async () => {
      setIsLoadingMosaic(true);

      // Drop the seed placeholder ({avgColour:null}) and any failed entries.
      const renderable: RenderableTrack[] = (tracks as Track[]).filter(
        (t): t is RenderableTrack => !!t.img && Array.isArray(t.avgColour)
      );
      if (!renderable.length) return;

      const img = await new Promise<HTMLImageElement>((resolve) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.src = imageSrc;
      });
      if (cancelled) return;

      const { w, h } = scaledDimensions(img);
      setWidth(w);
      setHeight(h);

      // Read the downscaled source pixels once via a detached canvas.
      const src = document.createElement('canvas');
      src.width = w;
      src.height = h;
      const srcCtx = src.getContext('2d');
      if (!srcCtx) return;
      srcCtx.drawImage(img, 0, 0, w, h);
      const imageData = srcCtx.getImageData(0, 0, w, h);

      const trackColours = normaliseTrackColours(
        renderable.map((t) => t.avgColour)
      );
      const images = await preloadTracks(renderable);
      if (cancelled) return;

      // Match each pixel to its nearest track colour, then composite the tiles.
      const indices = matchIndices(imageData.data, w, h, trackColours);
      const out = document.createElement('canvas');
      out.width = w * TILE;
      out.height = h * TILE;
      const outCtx = out.getContext('2d');
      if (!outCtx) return;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const tile = images[indices[y * w + x]];
          if (tile) outCtx.drawImage(tile, x * TILE, y * TILE, TILE, TILE);
        }
      }
      if (cancelled) return;
      out.toBlob((blob) => {
        if (blob) setImage(URL.createObjectURL(blob));
      }, 'image/png');
    };

    run().catch((err) => {
      console.log(err);
      if (!cancelled) setIsLoadingMosaic(false);
    });

    return () => {
      cancelled = true;
    };
  }, [imageSrc, tracks]);

  // Revoke the last object URL on unmount.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  return (
    <Box
      sx={{ display: 'grid', gridTemplateRows: 'auto 1fr', height: '100%' }}
    >
      <Box
        sx={{
          display: 'flex',
          m: '2rem 1.5rem',
          overflowX: 'auto',
          '& > *': { m: '0 0.5rem' },
        }}
      >
        <Button
          variant="contained"
          color="primary"
          onClick={() => {
            setReturnToMosaic(true);
            navigate(constants.select_playlist_url);
          }}
        >
          Select New Playlist
        </Button>

        <Button
          variant="contained"
          color="primary"
          onClick={() => {
            navigate(constants.select_image_url);
          }}
        >
          Upload New Image
        </Button>
        <Button
          disabled={isLoadingMosaic || fetchMoreUrl === null}
          variant="contained"
          color="primary"
          onClick={fetchMoreTracks}
        >
          Fetch More Tracks
        </Button>
        <Button
          disabled={isLoadingMosaic}
          variant="contained"
          color="primary"
          onClick={() => {
            const link = document.createElement('a');
            link.href = selectedTrackImage;
            link.setAttribute('download', 'mosaic.png');
            document.body.appendChild(link);
            link.click();
          }}
        >
          Download Mosaic
        </Button>
      </Box>

      {isLoadingMosaic ? (
        <Loading />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateRows: '1fr auto',
            height: '100%',
            minHeight: 0,
          }}
        >
          <ScrollContainer
            style={{
              maxHeight: '100%',
              maxWidth: '100%',
              overflow: 'auto',
              display: 'flex',
            }}
          >
            {/* margin:auto centres the image while it fits, but keeps overflow
                scrollable in every direction when zoomed in. */}
            <img
              style={{ margin: 'auto' }}
              src={selectedTrackImage}
              width={width * value}
              height={height * value}
              alt="mosaic"
            />
          </ScrollContainer>
          <Box sx={{ m: '2rem 4rem' }}>
            <Slider
              value={value}
              onChange={handleChange}
              aria-labelledby="continuous-slider"
              min={1}
              max={64}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
};
export default Mosaic;
