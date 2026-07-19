import { IconLayoutCollage } from '@tabler/icons-react';
import { Button } from '@react-mono/shared-ui';
import { WizardLayout } from '@react-mono/mosaify-ui';
import {
  ConnectToSpotify,
  SelectPlaylist,
  SelectImage,
  Mosaic,
  useMosaifyWizard,
  WIZARD_STEP_INDICATORS,
} from '@react-mono/mosaify-feature';

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
        <IconLayoutCollage size={14} className="text-black" />
      </div>
      <span className="font-display font-bold text-sm tracking-tight text-foreground">Mosaify</span>
    </div>
  );
}

function ConnectedBadge({ name, onSwitch }: { name: string; onSwitch: () => void }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      Connected as {name}
      <Button
        variant="link"
        onClick={onSwitch}
        className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
      >
        Switch
      </Button>
    </div>
  );
}

function BackgroundTexture() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(29,185,84,0.07) 0%, transparent 60%)',
      }}
    />
  );
}

type WizardHandlers = Pick<
  ReturnType<typeof useMosaifyWizard>,
  | 'selectPlaylist'
  | 'setPlaylistSearch'
  | 'selectImage'
  | 'connect'
  | 'confirmPlaylist'
  | 'confirmImage'
  | 'reset'
>;

function WizardContent({
  view,
  handlers,
}: {
  view: ReturnType<typeof useMosaifyWizard>['view'];
  handlers: WizardHandlers;
}) {
  switch (view.step) {
    case 'connect':
      return (
        <ConnectToSpotify
          onConnect={handlers.connect}
          status={view.status}
          configured={view.configured}
          error={view.error}
        />
      );
    case 'playlist':
      return (
        <SelectPlaylist
          playlists={view.playlists}
          selected={view.selected}
          loading={view.loading}
          search={view.search}
          onSearchChange={handlers.setPlaylistSearch}
          onSelect={handlers.selectPlaylist}
          onNext={handlers.confirmPlaylist}
        />
      );
    case 'image':
      return (
        <SelectImage
          images={view.images}
          selected={view.selected}
          onSelect={handlers.selectImage}
          onGenerate={handlers.confirmImage}
        />
      );
    case 'mosaic':
      return (
        <Mosaic
          image={view.image}
          playlist={view.playlist}
          tiles={view.tiles}
          onReset={handlers.reset}
        />
      );
    default:
      return null;
  }
}

export function App() {
  const {
    view,
    stepNumber,
    profile,
    selectPlaylist,
    setPlaylistSearch,
    selectImage,
    connect,
    confirmPlaylist,
    confirmImage,
    back,
    reset,
    switchAccount,
  } = useMosaifyWizard();

  const handlers = {
    selectPlaylist,
    setPlaylistSearch,
    selectImage,
    connect,
    confirmPlaylist,
    confirmImage,
    reset,
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col relative overflow-hidden">
      <BackgroundTexture />

      <header className="relative z-10 flex items-center justify-between px-6 pt-6 pb-0">
        <Brand />
        {profile && <ConnectedBadge name={profile.name} onSwitch={switchAccount} />}
      </header>

      <WizardLayout stepNumber={stepNumber} steps={WIZARD_STEP_INDICATORS} onBack={back}>
        <WizardContent view={view} handlers={handlers} />
      </WizardLayout>
    </div>
  );
}

export default App;
