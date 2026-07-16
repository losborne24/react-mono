import type { Playlist, SourceImage } from '@react-mono/models';

export interface MosaicGridProps {
  image: SourceImage;
  playlists: Playlist[];
  cols?: number;
  rows?: number;
}

// Playlist arts tiled with the target image blended over for color fidelity.
export function MosaicGrid({
  image,
  playlists,
  cols = 22,
  rows = 16,
}: MosaicGridProps) {
  const total = cols * rows;

  const tiles = Array.from({ length: total }, (_, i) => {
    // Deterministic but varied distribution
    const spread = (i * 11 + Math.floor(i / cols) * 7 + (i % 3) * 3) % playlists.length;
    return playlists[spread];
  });

  return (
    <div
      className="relative overflow-hidden rounded-2xl shadow-2xl"
      style={{ width: '100%', maxWidth: 660, aspectRatio: `${cols}/${rows}` }}
    >
      {/* Tile grid */}
      <div
        className="absolute inset-0 grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {tiles.map((playlist, i) => (
          <div key={i} className="overflow-hidden bg-muted">
            <img
              src={playlist.img}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>
      {/* Target image overlay — "color" blend maps the mosaic tiles to the photo's palette */}
      <img
        src={image.url}
        alt={image.label}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        style={{ mixBlendMode: 'color', opacity: 0.78 }}
      />
      {/* Subtle vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)',
        }}
      />
    </div>
  );
}

export default MosaicGrid;
