import { ChevronRight } from 'lucide-react';
import type { Playlist } from '@react-mono/models';
import { PlaylistCard } from '@react-mono/spotify-mosaic-ui';

export interface SelectPlaylistProps {
  playlists: Playlist[];
  selected: Playlist | null;
  onSelect: (playlist: Playlist) => void;
  onNext: () => void;
}

export function SelectPlaylist({
  playlists,
  selected,
  onSelect,
  onNext,
}: SelectPlaylistProps) {
  return (
    <div className="flex flex-col flex-1 px-6 pb-12 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold text-foreground mb-1">
          Choose a playlist
        </h2>
        <p className="text-muted-foreground text-sm">
          Select which playlist&apos;s artwork will tile your mosaic.
        </p>
      </div>

      {/* Playlist grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-8">
        {playlists.map((playlist) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            selected={selected?.id === playlist.id}
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
          <p className="text-sm text-muted-foreground">No playlist selected</p>
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

export default SelectPlaylist;
