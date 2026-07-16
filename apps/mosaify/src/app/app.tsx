import { IconLayoutCollage } from '@tabler/icons-react';
import { WizardLayout } from '@react-mono/spotify-mosaic-ui';
import {
  ConnectToSpotify,
  SelectPlaylist,
  SelectImage,
  Mosaic,
  useMosaifyWizard,
} from '@react-mono/spotify-mosaic-feature';

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
        <IconLayoutCollage size={14} className="text-black" />
      </div>
      <span className="font-display font-bold text-sm tracking-tight text-foreground">
        Mosaify
      </span>
    </div>
  );
}

function ConnectedBadge({
  name,
  onSwitch,
}: {
  name: string;
  onSwitch: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      Connected as {name}
      <button
        type="button"
        onClick={onSwitch}
        className="text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer transition-colors"
      >
        Switch
      </button>
    </div>
  );
}

export function App() {
  const {
    view,
    stepNumber,
    profile,
    canGoBack,
    selectPlaylist,
    selectImage,
    connect,
    confirmPlaylist,
    confirmImage,
    back,
    reset,
    switchAccount,
  } = useMosaifyWizard();

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col relative overflow-hidden">
      {/* Background texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(29,185,84,0.07) 0%, transparent 60%)',
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-6 pb-0">
        <Brand />
        {profile && (
          <ConnectedBadge name={profile.name} onSwitch={switchAccount} />
        )}
      </header>

      <WizardLayout stepNumber={stepNumber}>
        {view.step === 'connect' && (
          <ConnectToSpotify
            onConnect={connect}
            status={view.status}
            configured={view.configured}
            error={view.error}
          />
        )}
        {view.step === 'playlist' && (
          <SelectPlaylist
            playlists={view.playlists}
            selected={view.selected}
            loading={view.loading}
            onSelect={selectPlaylist}
            onNext={confirmPlaylist}
            onBack={canGoBack ? back : undefined}
          />
        )}
        {view.step === 'image' && (
          <SelectImage
            images={view.images}
            selected={view.selected}
            onSelect={selectImage}
            onGenerate={confirmImage}
            onBack={canGoBack ? back : undefined}
          />
        )}
        {view.step === 'mosaic' && (
          <Mosaic
            image={view.image}
            playlist={view.playlist}
            tiles={view.tiles}
            onReset={reset}
          />
        )}
      </WizardLayout>
    </div>
  );
}

export default App;
