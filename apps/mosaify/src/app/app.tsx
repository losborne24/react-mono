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
    step,
    stepNumber,
    playlists,
    images,
    selectedPlaylist,
    selectedImage,
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
      headerAction={step !== 'connect' ? <ConnectedBadge /> : undefined}
      stepNumber={stepNumber}
    >
      {step === 'connect' && <ConnectToSpotify onConnect={connect} />}
      {step === 'playlist' && (
        <SelectPlaylist
          playlists={playlists}
          selected={selectedPlaylist}
          onSelect={selectPlaylist}
          onNext={confirmPlaylist}
        />
      )}
      {step === 'image' && (
        <SelectImage
          images={images}
          selected={selectedImage}
          onSelect={selectImage}
          onGenerate={confirmImage}
        />
      )}
      {step === 'mosaic' && selectedImage && selectedPlaylist && (
        <Mosaic
          image={selectedImage}
          playlist={selectedPlaylist}
          playlists={playlists}
          onReset={reset}
        />
      )}
    </WizardLayout>
  );
}

export default App;
