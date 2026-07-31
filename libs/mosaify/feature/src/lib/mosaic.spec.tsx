import type { Ref } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import type { Playlist, SourceImage } from '@react-mono/models';
import { DEFAULT_MATCH_ALGORITHM, MATCH_ALGORITHMS } from '@react-mono/mosaify-ui';
import { saveBlob } from '@react-mono/mosaify-util';
import { Mosaic } from './mosaic';

// Shared, test-controllable stand-in for the heavy <MosaicGrid> (canvas + worker):
// `emit` is the grid size it reports via onGrid on mount (null = never reports),
// and the spies back the imperative handle the component drives for exports.
const { gridMock } = vi.hoisted(() => ({
  gridMock: {
    emit: null as { cols: number; rows: number } | null,
    toBlob: vi.fn(),
    toSvg: vi.fn(),
    toPdf: vi.fn(),
  },
}));

vi.mock('@react-mono/mosaify-util', () => ({
  saveBlob: vi.fn(),
}));

vi.mock('@react-mono/mosaify-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-mono/mosaify-ui')>();
  const { forwardRef, useEffect, useImperativeHandle } = await import('react');
  const MosaicGrid = forwardRef(function MosaicGridMock(
    { onGrid }: { onGrid?: (g: { cols: number; rows: number }) => void },
    ref: Ref<unknown>,
  ) {
    useImperativeHandle(ref, () => ({
      toBlob: gridMock.toBlob,
      toSvg: gridMock.toSvg,
      toPdf: gridMock.toPdf,
    }));
    useEffect(() => {
      if (gridMock.emit) onGrid?.(gridMock.emit);
    }, [onGrid]);
    return <div data-testid="mosaic-grid" />;
  });
  return { ...actual, MosaicGrid };
});

const IMAGE: SourceImage = { id: 'img-1', url: 'http://img/1', label: 'Sunset' };
const PLAYLIST: Playlist = {
  id: 'pl-1',
  title: 'My Playlist',
  artist: 'Various',
  tracks: 12,
  img: 'http://img/pl',
};
const TRACK_COVERS: SourceImage[] = [
  { id: 't1', url: 'http://img/t1', label: 'Cover 1' },
  { id: 't2', url: 'http://img/t2', label: 'Cover 2' },
  { id: 't3', url: 'http://img/t3', label: 'Cover 3' },
];

const defaultAlgorithm = MATCH_ALGORITHMS.find((a) => a.id === DEFAULT_MATCH_ALGORITHM);
const otherAlgorithm = MATCH_ALGORITHMS.find((a) => a.id !== DEFAULT_MATCH_ALGORITHM);
if (!defaultAlgorithm || !otherAlgorithm) throw new Error('expected match algorithms to exist');

function renderMosaic(onReset = vi.fn()) {
  const utils = render(
    <Mosaic image={IMAGE} playlist={PLAYLIST} trackCovers={TRACK_COVERS} onReset={onReset} />,
  );
  return { onReset, ...utils };
}

/**
 * Value of the stat card under the given label. A StatItem pairs two <span>s
 * (label + value); the requirement that the sibling be a <span> disambiguates
 * from the ControlToggle headings that reuse "Methodology"/"Tiles" text.
 */
function statValue(container: HTMLElement, label: string): string | undefined {
  const labelEl = Array.from(container.querySelectorAll('span')).find(
    (el) => el.textContent === label && el.nextElementSibling?.tagName === 'SPAN',
  );
  return labelEl?.nextElementSibling?.textContent ?? undefined;
}

beforeEach(() => {
  gridMock.emit = { cols: 10, rows: 8 };
  gridMock.toBlob.mockReset().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
  gridMock.toSvg.mockReset().mockResolvedValue(new Blob(['<svg/>'], { type: 'image/svg+xml' }));
  gridMock.toPdf.mockReset().mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
  vi.mocked(saveBlob).mockReset();
});

describe('Mosaic', () => {
  it('renders the header with the image label and playlist title', () => {
    const { getByText } = renderMosaic();
    expect(getByText('Your mosaic')).toBeTruthy();
    expect(getByText(/Sunset/)).toBeTruthy();
    expect(getByText('My Playlist')).toBeTruthy();
  });

  it('reports grid, tile count, unique artwork and methodology stats once the grid is ready', () => {
    const { container } = renderMosaic();
    expect(statValue(container, 'Grid')).toBe('10 × 8');
    expect(statValue(container, 'Tiles')).toBe('80');
    expect(statValue(container, 'Unique artwork')).toBe('3');
    expect(statValue(container, 'Methodology')).toBe(defaultAlgorithm.term);
  });

  it('shows placeholder stats and disables actions before the grid reports', () => {
    gridMock.emit = null;
    const { container, getByText } = renderMosaic();
    expect(statValue(container, 'Grid')).toBe('—');
    expect(statValue(container, 'Tiles')).toBe('—');
    expect(getByText('Download').closest('button')?.disabled).toBe(true);
    expect(getByText('Share').closest('button')?.disabled).toBe(true);
  });

  it('enables the export controls once the grid is ready', () => {
    const { getByText } = renderMosaic();
    expect(getByText('Download').closest('button')?.disabled).toBe(false);
    expect(getByText('Share').closest('button')?.disabled).toBe(false);
  });

  it('calls onReset when "Start over" is clicked', () => {
    const { getByText, onReset } = renderMosaic();
    fireEvent.click(getByText('Start over'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('updates the methodology stat when a different algorithm is selected', () => {
    const { container, getByText } = renderMosaic();
    fireEvent.click(getByText(otherAlgorithm.label));
    expect(statValue(container, 'Methodology')).toBe(otherAlgorithm.term);
  });

  describe('share', () => {
    const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
    const originalCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare');

    afterEach(() => {
      if (originalShare) Object.defineProperty(navigator, 'share', originalShare);
      else delete (navigator as { share?: unknown }).share;
      if (originalCanShare) Object.defineProperty(navigator, 'canShare', originalCanShare);
      else delete (navigator as { canShare?: unknown }).canShare;
    });

    it('uses the Web Share API when the platform can share the file', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
      Object.defineProperty(navigator, 'share', { value: share, configurable: true });

      const { getByText } = renderMosaic();
      fireEvent.click(getByText('Share'));

      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      const file = share.mock.calls[0][0].files[0] as File;
      expect(file.name).toBe('mosaify-my-playlist.jpg');
      expect(saveBlob).not.toHaveBeenCalled();
    });

    it('falls back to a download when the platform cannot share files', async () => {
      Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });

      const { getByText } = renderMosaic();
      fireEvent.click(getByText('Share'));

      await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
      expect(vi.mocked(saveBlob).mock.calls[0][1]).toBe('mosaify-my-playlist.jpg');
    });

    it('does nothing when the grid produces no blob', async () => {
      gridMock.toBlob.mockResolvedValue(null);
      Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });

      const { getByText } = renderMosaic();
      fireEvent.click(getByText('Share'));

      // Wait for the share action to settle (button leaves its "Sharing…" state).
      await waitFor(() => expect(getByText('Share')).toBeTruthy());
      expect(saveBlob).not.toHaveBeenCalled();
    });
  });
});
