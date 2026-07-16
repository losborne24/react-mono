import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { Playlist } from '@react-mono/models';
import { PlaylistCard } from '@react-mono/spotify-mosaic-ui';
import { Loading } from '@react-mono/shared-ui';

export interface SelectPlaylistProps {
  playlists: Playlist[];
  selected: Playlist | null;
  onSelect: (playlist: Playlist) => void;
  onNext: () => void;
  /** Go to the previous step; hidden when omitted. */
  onBack?: () => void;
  /** True while playlists are being fetched from Spotify. */
  loading?: boolean;
}

export function SelectPlaylist({
  playlists,
  selected,
  onSelect,
  onNext,
  onBack,
  loading = false,
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
      {loading ? (
        <div className="flex items-center justify-center flex-1 py-16">
          <Loading label="Loading your playlists…" size={20} />
        </div>
      ) : playlists.length === 0 ? (
        <div className="flex items-center justify-center flex-1 py-16">
          <p className="text-sm text-muted-foreground">
            No playlists found on your account.
          </p>
        </div>
      ) : (
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
      )}

      <div className="flex items-center justify-between mt-auto">
        {selected ? (
          <p className="text-sm text-muted-foreground">
            <span className="text-primary font-medium">{selected.title}</span> by{' '}
            {selected.artist} selected
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No playlist selected</p>
        )}
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm text-muted-foreground hover:text-foreground border border-border hover:bg-muted/50 transition-all duration-200 cursor-pointer"
            >
              <IconChevronLeft size={16} />
              Back
            </button>
          )}
          <button
            onClick={onNext}
            disabled={!selected}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#1db954', color: '#000' }}
          >
            Next
            <IconChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default SelectPlaylist;
