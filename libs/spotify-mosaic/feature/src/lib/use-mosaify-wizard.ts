import { useCallback, useState } from 'react';
import type { Playlist, SourceImage } from '@react-mono/models';
import { PLAYLISTS, SAMPLE_IMAGES } from '@react-mono/spotify-mosaic-data';

export const WIZARD_STEPS = [
  'connect',
  'playlist',
  'image',
  'mosaic',
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

/**
 * Render-ready view of the current step. The `mosaic` variant guarantees
 * non-null `image`/`playlist`, so the shell cannot render Mosaic without data.
 */
export type WizardView =
  | { step: 'connect' }
  | { step: 'playlist'; playlists: Playlist[]; selected: Playlist | null }
  | { step: 'image'; images: SourceImage[]; selected: SourceImage | null }
  | { step: 'mosaic'; image: SourceImage; playlist: Playlist };

export interface MosaifyWizard {
  step: WizardStep;
  view: WizardView;
  stepIndex: number;
  stepNumber: number;
  totalSteps: number;
  playlists: Playlist[];
  images: SourceImage[];
  selectedPlaylist: Playlist | null;
  selectedImage: SourceImage | null;
  canGoBack: boolean;
  selectPlaylist: (playlist: Playlist | null) => void;
  selectImage: (image: SourceImage | null) => void;
  connect: () => void;
  confirmPlaylist: () => void;
  confirmImage: () => void;
  back: () => void;
  reset: () => void;
}

export function useMosaifyWizard(): MosaifyWizard {
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null
  );
  const [selectedImage, setSelectedImage] = useState<SourceImage | null>(null);

  const advance = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
  }, []);

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const connect = useCallback(() => advance(), [advance]);

  const confirmPlaylist = useCallback(() => {
    if (selectedPlaylist) advance();
  }, [selectedPlaylist, advance]);

  const confirmImage = useCallback(() => {
    if (selectedImage) advance();
  }, [selectedImage, advance]);

  const reset = useCallback(() => {
    setStepIndex(0);
    setSelectedPlaylist(null);
    setSelectedImage(null);
  }, []);

  const step = WIZARD_STEPS[stepIndex];

  const buildView = (): WizardView => {
    switch (step) {
      case 'playlist':
        return { step, playlists: PLAYLISTS, selected: selectedPlaylist };
      case 'image':
        return { step, images: SAMPLE_IMAGES, selected: selectedImage };
      case 'mosaic':
        // Guaranteed by confirmPlaylist/confirmImage advance guards; fall back
        // to connect if state was somehow reached without data.
        if (selectedImage && selectedPlaylist) {
          return { step, image: selectedImage, playlist: selectedPlaylist };
        }
        return { step: 'connect' };
      case 'connect':
      default:
        return { step: 'connect' };
    }
  };

  return {
    step,
    view: buildView(),
    stepIndex,
    stepNumber: stepIndex + 1,
    totalSteps: WIZARD_STEPS.length,
    playlists: PLAYLISTS,
    images: SAMPLE_IMAGES,
    selectedPlaylist,
    selectedImage,
    canGoBack: stepIndex > 0,
    selectPlaylist: setSelectedPlaylist,
    selectImage: setSelectedImage,
    connect,
    confirmPlaylist,
    confirmImage,
    back,
    reset,
  };
}
