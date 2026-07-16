import { IconLayoutCollage, IconAlertTriangle } from '@tabler/icons-react';
import { SpotifyLogo } from '@react-mono/spotify-mosaic-ui';
import { Loading } from '@react-mono/shared-ui';
import type { AuthStatus } from './use-mosaify-wizard';

export interface ConnectToSpotifyProps {
  onConnect: () => void;
  /** Auth lifecycle; drives the button/spinner state. */
  status?: AuthStatus;
  /** False when VITE_SPOTIFY_CLIENT_ID is missing — login can't proceed. */
  configured?: boolean;
  error?: string | null;
}

export function ConnectToSpotify({
  onConnect,
  status = 'unauthenticated',
  configured = true,
  error = null,
}: ConnectToSpotifyProps) {
  const checking = status === 'checking';

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
            <IconLayoutCollage size={12} className="text-black" />
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

        {!configured && (
          <div className="flex items-start gap-2 max-w-sm text-left rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground">
            <IconAlertTriangle size={16} className="text-destructive mt-0.5 shrink-0" />
            <span>
              Spotify isn&apos;t configured. Set{' '}
              <code className="text-primary">VITE_SPOTIFY_CLIENT_ID</code> in{' '}
              <code>.env.local</code> and restart the dev server.
            </span>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive max-w-sm">{error}</p>
        )}

        <button
          onClick={onConnect}
          disabled={checking || !configured}
          className="flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-base transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: '#1db954', color: '#000' }}
        >
          {checking ? (
            <Loading label="Checking session…" size={18} className="text-black" />
          ) : (
            <>
              <SpotifyLogo size={20} />
              Connect with Spotify
            </>
          )}
        </button>

        <p className="text-xs text-muted-foreground max-w-xs">
          We only read your playlists and profile name — we never post on your
          behalf.
        </p>
      </div>
    </div>
  );
}

export default ConnectToSpotify;
