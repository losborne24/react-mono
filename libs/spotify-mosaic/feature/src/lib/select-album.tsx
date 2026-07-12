import { ChevronRight } from 'lucide-react';
import type { Album } from '@react-mono/models';
import { AlbumCard } from '@react-mono/spotify-mosaic-ui';

export interface SelectAlbumProps {
  albums: Album[];
  selected: Album | null;
  onSelect: (album: Album) => void;
  onNext: () => void;
}

export function SelectAlbum({
  albums,
  selected,
  onSelect,
  onNext,
}: SelectAlbumProps) {
  return (
    <div className="flex flex-col flex-1 px-6 pb-12 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h2
          className="text-2xl font-bold text-foreground mb-1"
          style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
        >
          Choose an album
        </h2>
        <p className="text-muted-foreground text-sm">
          Select which album&apos;s artwork will tile your mosaic.
        </p>
      </div>

      {/* Album grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-8">
        {albums.map((album) => (
          <AlbumCard
            key={album.id}
            album={album}
            selected={selected?.id === album.id}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="flex items-center justify-between mt-auto">
        {selected ? (
          <p className="text-sm text-muted-foreground">
            <span className="text-primary font-medium">{selected.title}</span> by{' '}
            {selected.artist} selected
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No album selected</p>
        )}
        <button
          onClick={onNext}
          disabled={!selected}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: '#1db954', color: '#000' }}
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export default SelectAlbum;
