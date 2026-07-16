import { useState } from 'react';
import { Layers } from 'lucide-react';
import { SpotifyLogo } from '@react-mono/spotify-mosaic-ui';
import { Loading } from '@react-mono/shared-ui';

export interface ConnectToSpotifyProps {
  onConnect: () => void;
}

export function ConnectToSpotify({ onConnect }: ConnectToSpotifyProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    setLoading(true);
    setTimeout(onConnect, 1200);
  };

  return (
    <div
      className="flex flex-col items-center justify-center flex-1 px-6 text-center"
      style={{ minHeight: '60vh' }}
    >
      {/* Ambient glow */}
      <div
        className="absolute w-96 h-96 rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(29,185,84,0.12) 0%, transparent 70%)',
          transform: 'translate(-50%, -50%)',
          left: '50%',
          top: '50%',
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Icon cluster */}
        <div className="relative">
          <div className="w-24 h-24 rounded-2xl bg-card border border-border flex items-center justify-center shadow-2xl">
            <div className="text-primary">
              <SpotifyLogo size={44} />
            </div>
          </div>
          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <Layers size={12} className="text-black" />
          </div>
        </div>

        <div className="flex flex-col gap-3 max-w-sm">
          <h1 className="font-display text-4xl font-bold text-foreground leading-tight">
            Turn your music into art
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Connect your Spotify account to build stunning photo mosaics from
            your playlist artwork.
          </p>
        </div>

        <button
          onClick={handleClick}
          disabled={loading}
          className="flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-base transition-all duration-200 disabled:opacity-70"
          style={{
            background: loading ? 'rgba(29,185,84,0.6)' : '#1db954',
            color: '#000',
          }}
        >
          {loading ? (
            <Loading label="Connecting…" size={18} className="text-black" />
          ) : (
            <>
              <SpotifyLogo size={20} />
              Connect with Spotify
            </>
          )}
        </button>

        <p className="text-xs text-muted-foreground max-w-xs">
          We only read your saved albums and liked songs — we never post on your
          behalf.
        </p>
      </div>
    </div>
  );
}

export default ConnectToSpotify;
