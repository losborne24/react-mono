import { Layers } from 'lucide-react';
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
        <Layers size={14} className="text-black" />
      </div>
      <span className="font-display font-bold text-sm tracking-tight text-foreground">
        Mosaify
      </span>
    </div>
  );
}

function ConnectedBadge() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      Connected as Alex Chen
    </div>
  );
}

export function App() {
  const {
    view,
    stepNumber,
    playlists,
    selectPlaylist,
    selectImage,
    connect,
    confirmPlaylist,
    confirmImage,
    reset,
  } = useMosaifyWizard();

  return (
    <WizardLayout
      brand={<Brand />}
      headerAction={view.step !== 'connect' ? <ConnectedBadge /> : undefined}
      stepNumber={stepNumber}
    >
      {view.step === 'connect' && <ConnectToSpotify onConnect={connect} />}
      {view.step === 'playlist' && (
        <SelectPlaylist
          playlists={view.playlists}
          selected={view.selected}
          onSelect={selectPlaylist}
          onNext={confirmPlaylist}
        />
      )}
      {view.step === 'image' && (
        <SelectImage
          images={view.images}
          selected={view.selected}
          onSelect={selectImage}
          onGenerate={confirmImage}
        />
      )}
      {view.step === 'mosaic' && (
        <Mosaic
          image={view.image}
          playlist={view.playlist}
          playlists={playlists}
          onReset={reset}
        />
      )}
    </WizardLayout>
  );
}

export default App;
