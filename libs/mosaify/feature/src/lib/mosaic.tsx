import { useCallback, useRef, useState } from 'react';
import { IconDownload, IconFileTypeSvg, IconShare2, IconRefresh } from '@tabler/icons-react';
import type { Playlist, SourceImage } from '@react-mono/models';
import {
  MosaicGrid,
  MATCH_ALGORITHMS,
  DEFAULT_MATCH_ALGORITHM,
  type MosaicGridHandle,
} from '@react-mono/mosaify-ui';
import { Button, ButtonGroup, ICON_SIZE } from '@react-mono/shared-ui';

/** Selectable tile counts along the image's longer edge; shorter edge follows aspect. */
const RESOLUTION_OPTIONS = [64, 256, 512] as const;
type Resolution = (typeof RESOLUTION_OPTIONS)[number];
const DEFAULT_RESOLUTION: Resolution = 256;

const RESOLUTION_TOGGLE_OPTIONS: { value: Resolution; label: string }[] = RESOLUTION_OPTIONS.map(
  (value) => ({ value, label: `${value}` }),
);

const ALGORITHM_TOGGLE_OPTIONS = MATCH_ALGORITHMS.map(({ id, label }) => ({
  value: id,
  label,
}));

interface ControlToggleProps<T extends string | number> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
}

/** Labelled segmented control (horizontal buttons), stacked in the mosaic's side column. */
function ControlToggle<T extends string | number>({
  label,
  options,
  value,
  disabled,
  onChange,
}: ControlToggleProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
        {label}
      </span>
      <ButtonGroup>
        {options.map((option) => (
          <Button
            key={String(option.value)}
            size="sm"
            variant={option.value === value ? 'secondary' : 'outline'}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </ButtonGroup>
    </div>
  );
}

export interface MosaicProps {
  image: SourceImage;
  playlist: Playlist;
  /** Album artwork used as mosaic tiles. */
  trackCovers: SourceImage[];
  onReset: () => void;
}

/** Filesystem-safe slug from the playlist title, for the downloaded file name. */
function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'mosaic'
  );
}

/** Trigger a browser download for a blob under the given file name. */
function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** File extension matching a raster blob's MIME (webp or jpeg). */
function extFor(blob: Blob): string {
  return blob.type === 'image/webp' ? 'webp' : 'jpg';
}

export function Mosaic({ image, playlist, trackCovers, onReset }: MosaicProps) {
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null);
  const [resolution, setResolution] = useState<Resolution>(DEFAULT_RESOLUTION);
  const [algorithm, setAlgorithm] = useState<string>(DEFAULT_MATCH_ALGORITHM);
  const handleGrid = useCallback((g: { cols: number; rows: number }) => setGrid(g), []);
  const gridRef = useRef<MosaicGridHandle>(null);
  const [busy, setBusy] = useState<'download' | 'svg' | 'share' | null>(null);

  const baseName = `mosaify-${slugify(playlist.title)}`;

  const handleDownload = useCallback(async () => {
    // Export the mosaic exactly as configured, at full per-tile crispness.
    const blob = await gridRef.current?.toBlob('max');
    if (!blob) return;
    saveBlob(blob, `${baseName}.${extFor(blob)}`);
  }, [baseName]);

  const handleExportSvg = useCallback(async () => {
    // Dedup export: each unique cover embedded once, full 256px per tile at any density.
    const blob = await gridRef.current?.toSvg();
    if (!blob) return;
    saveBlob(blob, `${baseName}.svg`);
  }, [baseName]);

  const handleShare = useCallback(async () => {
    // Share over the network at standard fidelity — keeps the file small enough to send.
    const blob = await gridRef.current?.toBlob('standard');
    if (!blob) return;
    const file = new File([blob], `${baseName}.${extFor(blob)}`, { type: blob.type });
    const shareData = {
      files: [file],
      title: 'My Mosaify mosaic',
      text: `A mosaic of ${image.label} made from ${playlist.title} artwork.`,
    };
    // Web Share with files isn't universal — fall back to a plain download.
    if (navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
      } catch {
        // User dismissed the share sheet — nothing to do.
      }
      return;
    }
    await handleDownload();
  }, [baseName, image.label, playlist.title, handleDownload]);

  const runAction = useCallback(
    (action: 'download' | 'svg' | 'share', fn: () => Promise<void>) => {
      if (busy) return;
      setBusy(action);
      fn().finally(() => setBusy(null));
    },
    [busy],
  );

  const onDownload = useCallback(
    () => runAction('download', handleDownload),
    [runAction, handleDownload],
  );

  const onExportSvg = useCallback(
    () => runAction('svg', handleExportSvg),
    [runAction, handleExportSvg],
  );

  const onShare = useCallback(() => runAction('share', handleShare), [runAction, handleShare]);

  const total = grid ? grid.cols * grid.rows : 0;

  const stats = [
    { label: 'Grid', value: grid ? `${grid.cols} × ${grid.rows}` : '—' },
    { label: 'Tiles', value: total ? total.toLocaleString() : '—' },
    { label: 'Unique artwork', value: `${trackCovers.length}` },
    { label: 'Playlist', value: playlist.artist },
  ];

  return (
    <div className="flex flex-col flex-1 px-6 pb-12 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold text-foreground mb-1">Your mosaic</h2>
        <p className="text-muted-foreground text-sm">
          {image.label} · recreated from{' '}
          <span className="text-foreground/80">{playlist.title}</span> artwork
        </p>
      </div>

      {/* Mosaic + controls */}
      <div className="flex items-start justify-center mb-6">
        <div className="relative shrink-0" style={{ width: 660, maxWidth: '100%' }}>
          <MosaicGrid
            ref={gridRef}
            image={image}
            tiles={trackCovers}
            resolution={resolution}
            algorithm={algorithm}
            onGrid={handleGrid}
          />
          <div className="absolute left-full top-0 ml-6 flex shrink-0 flex-col gap-6 rounded-xl border border-border bg-card px-5 py-4">
            <ControlToggle
              label="Tiles"
              options={RESOLUTION_TOGGLE_OPTIONS}
              value={resolution}
              disabled={busy !== null}
              onChange={setResolution}
            />
            <ControlToggle
              label="Algorithm"
              options={ALGORITHM_TOGGLE_OPTIONS}
              value={algorithm}
              disabled={busy !== null}
              onChange={setAlgorithm}
            />
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex items-center gap-6 rounded-xl px-5 py-3 mb-6 border border-border bg-card">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
              {stat.label}
            </span>
            <span className="text-sm font-semibold text-foreground">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="spotify"
          size="lg"
          className="rounded-xl"
          disabled={!grid || busy !== null}
          onClick={onDownload}
        >
          <IconDownload size={ICON_SIZE.md} />
          {busy === 'download' ? 'Saving…' : 'Download'}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="rounded-xl"
          disabled={!grid || busy !== null}
          onClick={onExportSvg}
          title="Vector export — every tile at full 256px detail"
        >
          <IconFileTypeSvg size={ICON_SIZE.md} />
          {busy === 'svg' ? 'Exporting…' : 'SVG'}
        </Button>
        <button
          onClick={onShare}
          disabled={!grid || busy !== null}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm border border-border bg-card text-foreground hover:bg-secondary transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <IconShare2 size={ICON_SIZE.md} />
          {busy === 'share' ? 'Sharing…' : 'Share'}
        </button>
        <button
          onClick={onReset}
          className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground border border-border hover:border-border/60 transition-all duration-200 cursor-pointer"
        >
          <IconRefresh size={ICON_SIZE.sm} />
          Start over
        </button>
      </div>
    </div>
  );
}

export default Mosaic;
