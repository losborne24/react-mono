import { Check } from 'lucide-react';
import type { Playlist } from '@react-mono/models';

export interface PlaylistCardProps {
  playlist: Playlist;
  selected: boolean;
  onSelect: (playlist: Playlist) => void;
}

export function PlaylistCard({ playlist, selected, onSelect }: PlaylistCardProps) {
  return (
    <button
      onClick={() => onSelect(playlist)}
      className="group relative flex flex-col gap-2 rounded-xl p-2 text-left transition-all duration-200 border"
      style={{
        background: selected ? 'rgba(29,185,84,0.08)' : 'var(--card)',
        borderColor: selected ? 'rgba(29,185,84,0.5)' : 'var(--border)',
      }}
      aria-pressed={selected}
    >
      <div className="relative rounded-lg overflow-hidden aspect-square bg-muted">
        <img
          src={playlist.img}
          alt={playlist.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {selected && (
          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg">
              <Check size={14} className="text-black" strokeWidth={2.5} />
            </div>
          </div>
        )}
      </div>
      <div className="px-0.5 pb-0.5">
        <p className="text-xs font-semibold text-foreground truncate leading-tight">
          {playlist.title}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          {playlist.artist}
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          {playlist.year} · {playlist.tracks} tracks
        </p>
      </div>
    </button>
  );
}

export default PlaylistCard;
