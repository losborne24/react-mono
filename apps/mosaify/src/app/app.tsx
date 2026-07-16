import { useState } from 'react';
import { Layers } from 'lucide-react';
import type { Playlist, SourceImage } from '@react-mono/models';
import { PLAYLISTS, SAMPLE_IMAGES } from '@react-mono/spotify-mosaic-data';
import { StepIndicator } from '@react-mono/spotify-mosaic-ui';
import {
  ConnectToSpotify,
  SelectPlaylist,
  SelectImage,
  Mosaic,
} from '@react-mono/spotify-mosaic-feature';

export function App() {
  const [step, setStep] = useState(1);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [selectedImage, setSelectedImage] = useState<SourceImage | null>(null);

  const advance = (from: number) => setStep(from + 1);

  const handleConnect = () => advance(1);

  const handlePlaylistNext = () => {
    if (selectedPlaylist) advance(2);
  };

  const handleGenerate = () => {
    if (!selectedImage) advance(3);
  };

  const handleReset = () => {
    setStep(1);
    setSelectedPlaylist(null);
    setSelectedImage(null);
  };

  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
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
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Layers size={14} className="text-black" />
          </div>
          <span
            className="font-bold text-sm tracking-tight text-foreground"
            style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
          >
            Mosaify
          </span>
        </div>
        {step > 1 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Connected as Alex Chen
          </div>
        )}
      </header>

      {/* Step indicator */}
      <div className="relative z-10">
        <StepIndicator current={step} />
      </div>

      {/* Step content */}
      <main className="relative z-10 flex flex-col flex-1">
        {step === 1 && <ConnectToSpotify onConnect={handleConnect} />}
        {step === 2 && (
          <SelectPlaylist
            playlists={PLAYLISTS}
            selected={selectedPlaylist}
            onSelect={setSelectedPlaylist}
            onNext={handlePlaylistNext}
          />
        )}
        {step === 3 && (
          <SelectImage
            images={SAMPLE_IMAGES}
            selected={selectedImage}
            onSelect={setSelectedImage}
            onGenerate={handleGenerate}
          />
        )}
        {step === 4 && selectedImage && selectedPlaylist && (
          <Mosaic
            image={selectedImage}
            playlist={selectedPlaylist}
            playlists={PLAYLISTS}
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  );
}

export default App;
