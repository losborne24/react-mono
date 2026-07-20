import { IconChevronRight, IconSearch, IconX } from '@tabler/icons-react';
import type { Playlist } from '@react-mono/models';
import { PlaylistCard } from '@react-mono/mosaify-ui';
import { ICON_SIZE, Loading } from '@react-mono/shared-ui';

export interface SelectPlaylistProps {
  playlists: Playlist[];
  selected: Playlist | null;
  onSelect: (playlist: Playlist) => void;
  onNext: () => void;
  /** Current search query. */
  search: string;
  /** Called as the user types in the search box. */
  onSearchChange: (query: string) => void;
  /** True while playlists are being fetched from Spotify. */
  loading?: boolean;
}

interface PlaylistSearchProps {
  search: string;
  searching: boolean;
  onSearchChange: (query: string) => void;
}

function PlaylistSearch({ search, searching, onSearchChange }: PlaylistSearchProps) {
  return (
    <div className="relative mb-6">
      <IconSearch
        size={ICON_SIZE.md}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
      />
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search Spotify playlists, or paste a playlist link"
        className="w-full rounded-xl bg-muted/50 border border-border pl-9 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      {searching && (
        <button
          type="button"
          onClick={() => onSearchChange('')}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <IconX size={ICON_SIZE.md} />
        </button>
      )}
    </div>
  );
}

interface PlaylistGridProps {
  playlists: Playlist[];
  selected: Playlist | null;
  onSelect: (playlist: Playlist) => void;
  loading: boolean;
  searching: boolean;
  emptyLabel: string;
}

function PlaylistGrid({
  playlists,
  selected,
  onSelect,
  loading,
  searching,
  emptyLabel,
}: PlaylistGridProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 py-16">
        <Loading label={searching ? 'Searching…' : 'Loading your playlists…'} size={ICON_SIZE.lg} />
      </div>
    );
  }

  if (playlists.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1 py-16">
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return (
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
  );
}

interface SelectFooterProps {
  selected: Playlist | null;
  onNext: () => void;
}

function SelectFooter({ selected, onNext }: SelectFooterProps) {
  return (
    <div className="flex items-center justify-between mt-auto">
      {selected ? (
        <p className="text-sm text-muted-foreground">
          <span className="text-primary font-medium">{selected.title}</span> by {selected.artist}{' '}
          selected
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No playlist selected</p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={onNext}
          disabled={!selected}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: '#1db954', color: '#000' }}
        >
          Next
          <IconChevronRight size={ICON_SIZE.md} />
        </button>
      </div>
    </div>
  );
}

export function SelectPlaylist({
  playlists,
  selected,
  onSelect,
  onNext,
  search,
  onSearchChange,
  loading = false,
}: SelectPlaylistProps) {
  const searching = search.trim().length > 0;
  const emptyLabel = searching
    ? `No playlists match “${search.trim()}”.`
    : 'No playlists found on your account.';

  return (
    <div className="flex flex-col flex-1 px-6 pb-12 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold text-foreground mb-1">Choose a playlist</h2>
        <p className="text-muted-foreground text-sm">
          Select which playlist&apos;s artwork will tile your mosaic.
        </p>
      </div>

      <PlaylistSearch search={search} searching={searching} onSearchChange={onSearchChange} />

      <PlaylistGrid
        playlists={playlists}
        selected={selected}
        onSelect={onSelect}
        loading={loading}
        searching={searching}
        emptyLabel={emptyLabel}
      />

      <SelectFooter selected={selected} onNext={onNext} />
    </div>
  );
}

export default SelectPlaylist;
