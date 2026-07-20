import type { Playlist } from '@react-mono/models';
import { SelectableThumb } from './selectable-thumb';

export interface PlaylistCardProps {
  playlist: Playlist;
  selected: boolean;
  onSelect: (playlist: Playlist) => void;
}

export function PlaylistCard({ playlist, selected, onSelect }: PlaylistCardProps) {
  return (
    <button
      onClick={() => onSelect(playlist)}
      className="group relative flex flex-col gap-2 rounded-xl p-2 text-left transition-all duration-200 border cursor-pointer"
      style={{
        background: selected ? 'rgba(29,185,84,0.08)' : 'var(--card)',
        borderColor: selected ? 'rgba(29,185,84,0.5)' : 'var(--border)',
      }}
      aria-pressed={selected}
    >
      <SelectableThumb selected={selected}>
        <img
          src={playlist.img}
          alt={playlist.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </SelectableThumb>
      <div className="px-0.5 pb-0.5">
        <p className="text-xs font-semibold text-foreground truncate leading-tight">
          {playlist.title}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">{playlist.artist}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          {playlist.year ? `${playlist.year} · ` : ''}
          {playlist.tracks} tracks
        </p>
      </div>
    </button>
  );
}

export default PlaylistCard;
