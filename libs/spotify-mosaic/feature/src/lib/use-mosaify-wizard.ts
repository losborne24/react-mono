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

export interface MosaifyWizard {
  step: WizardStep;
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

  return {
    step: WIZARD_STEPS[stepIndex],
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
