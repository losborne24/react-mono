import { Download, Share2, RefreshCw } from 'lucide-react';
import type { Playlist, PickableImage } from '@react-mono/models';
import { MosaicGrid } from '@react-mono/spotify-mosaic-ui';

const COLS = 22;
const ROWS = 16;

export interface MosaicProps {
  image: PickableImage;
  playlist: Playlist;
  playlists: Playlist[];
  onReset: () => void;
}

export function Mosaic({ image, playlist, playlists, onReset }: MosaicProps) {
  const total = COLS * ROWS;

  const stats = [
    { label: 'Tiles', value: `${total.toLocaleString()}` },
    { label: 'Unique artworks', value: `${playlists.length}` },
    { label: 'Resolution', value: `${COLS * 30}×${ROWS * 30}px` },
    { label: 'Playlist', value: playlist.artist },
  ];

  return (
    <div className="flex flex-col flex-1 px-6 pb-12 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h2
          className="text-2xl font-bold text-foreground mb-1"
          style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
        >
          Your mosaic
        </h2>
        <p className="text-muted-foreground text-sm">
          {image.label} · recreated from{' '}
          <span className="text-foreground/80">{playlist.title}</span> artwork
        </p>
      </div>

      {/* Mosaic */}
      <div className="flex justify-center mb-6">
        <MosaicGrid image={image} playlists={playlists} cols={COLS} rows={ROWS} />
      </div>

      {/* Stats strip */}
      <div className="flex items-center gap-6 rounded-xl px-5 py-3 mb-6 border border-border bg-card">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
              {stat.label}
            </span>
            <span className="text-sm font-semibold text-foreground">
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200"
          style={{ background: '#1db954', color: '#000' }}
        >
          <Download size={15} />
          Download
        </button>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm border border-border bg-card text-foreground hover:bg-secondary transition-all duration-200">
          <Share2 size={15} />
          Share
        </button>
        <button
          onClick={onReset}
          className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground border border-border hover:border-border/60 transition-all duration-200"
        >
          <RefreshCw size={14} />
          Start over
        </button>
      </div>
    </div>
  );
}

export default Mosaic;
