import { useCallback, useRef, useState } from 'react';
import {
  IconFileTypeSvg,
  IconFileTypePdf,
  IconPhoto,
  IconShare2,
  IconRefresh,
} from '@tabler/icons-react';
import type { Playlist, SourceImage } from '@react-mono/models';
import {
  MosaicGrid,
  MATCH_ALGORITHMS,
  DEFAULT_MATCH_ALGORITHM,
  type MosaicGridHandle,
} from '@react-mono/mosaify-ui';
import { Button, ButtonGroup, ICON_SIZE, DownloadMenu } from '@react-mono/shared-ui';

/** Selectable tile counts along the image's longer edge; shorter edge follows aspect. */
const RESOLUTION_OPTIONS = [64, 128, 256, 512] as const;
type Resolution = (typeof RESOLUTION_OPTIONS)[number];
const DEFAULT_RESOLUTION: Resolution = 256;

const RESOLUTION_TOGGLE_OPTIONS: { value: Resolution; label: string }[] = RESOLUTION_OPTIONS.map(
  (value) => ({ value, label: `${value}` }),
);

const ALGORITHM_TOGGLE_OPTIONS = MATCH_ALGORITHMS.map(({ id, label }) => ({ value: id, label }));

/** The metric footnote to show under the algorithm toggle, keyed by option id. */
const ALGORITHM_FOOTNOTES: Record<string, { term: string; description: string }> =
  Object.fromEntries(
    MATCH_ALGORITHMS.map(({ id, term, description }) => [id, { term, description }]),
  );

interface ToggleOption<T extends string | number> {
  value: T;
  label: string;
}

/** Short explanatory note shown beneath a toggle, with an emphasised lead-in term. */
interface ToggleFootnote {
  term: string;
  description: string;
}

interface ControlToggleProps<T extends string | number> {
  label: string;
  options: readonly ToggleOption<T>[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
  /** Optional per-option notes, keyed by option value; surfaced via onFootnote on hover. */
  footnotes?: Record<string, ToggleFootnote>;
  /** Reports the footnote for the hovered button (or null on leave), for the parent to render. */
  onFootnote?: (footnote: ToggleFootnote | null) => void;
}

interface ToggleButtonProps<T extends string | number> {
  option: ToggleOption<T>;
  selected: boolean;
  disabled: boolean;
  onSelect: (value: T) => void;
  onHover: (value: T | null) => void;
}

function ToggleButton<T extends string | number>({
  option,
  selected,
  disabled,
  onSelect,
  onHover,
}: ToggleButtonProps<T>) {
  return (
    <Button
      size="sm"
      variant={selected ? 'secondary' : 'outline'}
      disabled={disabled}
      onClick={() => onSelect(option.value)}
      onMouseEnter={() => onHover(option.value)}
      onMouseLeave={() => onHover(null)}
    >
      {option.label}
    </Button>
  );
}

/** Labelled segmented control (horizontal buttons), shown in the controls row above the mosaic. */
function ControlToggle<T extends string | number>({
  label,
  options,
  value,
  disabled,
  onChange,
  footnotes,
  onFootnote,
}: ControlToggleProps<T>) {
  const handleHover = (hovered: T | null) => {
    const footnote = hovered !== null ? footnotes?.[String(hovered)] ?? null : null;
    onFootnote?.(footnote);
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
        {label}
      </span>
      <ButtonGroup orientation="horizontal">
        {options.map((option) => (
          <ToggleButton
            key={String(option.value)}
            option={option}
            selected={option.value === value}
            disabled={disabled}
            onSelect={onChange}
            onHover={handleHover}
          />
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

export function Mosaic({ image, playlist, trackCovers, onReset }: MosaicProps) {
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null);
  const [resolution, setResolution] = useState<Resolution>(DEFAULT_RESOLUTION);
  const [algorithm, setAlgorithm] = useState<string>(DEFAULT_MATCH_ALGORITHM);
  const [hoveredFootnote, setHoveredFootnote] = useState<ToggleFootnote | null>(null);
  const handleGrid = useCallback((g: { cols: number; rows: number }) => setGrid(g), []);
  const gridRef = useRef<MosaicGridHandle>(null);
  const [busy, setBusy] = useState<'download' | 'svg' | 'pdf' | 'share' | null>(null);

  const baseName = `mosaify-${slugify(playlist.title)}`;

  const handleDownload = useCallback(async () => {
    // Export the mosaic exactly as configured, at full per-tile crispness.
    const blob = await gridRef.current?.toBlob();
    if (!blob) return;
    saveBlob(blob, `${baseName}.jpg`);
  }, [baseName]);

  const handleExportSvg = useCallback(async () => {
    // Dedup export: each unique cover embedded once, full 512px per tile at any density.
    const blob = await gridRef.current?.toSvg();
    if (!blob) return;
    saveBlob(blob, `${baseName}.svg`);
  }, [baseName]);

  const handleExportPdf = useCallback(async () => {
    // Print-ready dedup export: each cover embedded once at 512px, referenced per cell.
    const blob = await gridRef.current?.toPdf();
    if (!blob) return;
    saveBlob(blob, `${baseName}.pdf`);
  }, [baseName]);

  const handleShare = useCallback(async () => {
    // Share the full-crispness export — same bitmap as download.
    const blob = await gridRef.current?.toBlob();
    if (!blob) return;
    const file = new File([blob], `${baseName}.jpg`, { type: blob.type });
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
    (action: 'download' | 'svg' | 'pdf' | 'share', fn: () => Promise<void>) => {
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

  const onExportPdf = useCallback(
    () => runAction('pdf', handleExportPdf),
    [runAction, handleExportPdf],
  );

  const onShare = useCallback(() => runAction('share', handleShare), [runAction, handleShare]);

  const downloadItems = [
    {
      id: 'image',
      icon: <IconPhoto size={ICON_SIZE.md} />,
      label: 'Image',
      description: 'JPEG bitmap',
      onSelect: onDownload,
    },
    {
      id: 'svg',
      icon: <IconFileTypeSvg size={ICON_SIZE.md} />,
      label: 'SVG',
      description: 'Vector — full 512px per tile',
      onSelect: onExportSvg,
    },
    {
      id: 'pdf',
      icon: <IconFileTypePdf size={ICON_SIZE.md} />,
      label: 'PDF',
      description: 'Print-ready — 300 DPI tiles',
      onSelect: onExportPdf,
    },
  ];

  const total = grid ? grid.cols * grid.rows : 0;
  const methodology = ALGORITHM_FOOTNOTES[algorithm];

  const stats = [
    { label: 'Grid', value: grid ? `${grid.cols} × ${grid.rows}` : '—' },
    { label: 'Tiles', value: total ? total.toLocaleString() : '—' },
    { label: 'Unique artwork', value: `${trackCovers.length}` },
    ...(methodology ? [{ label: 'Methodology', value: methodology.term }] : []),
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

      {/* Controls + mosaic */}
      <div className="flex flex-col items-center gap-6 mb-6">
        <div className="flex max-w-full flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4">
          <div className="flex flex-col items-start justify-center gap-4 sm:flex-row sm:gap-8">
            <ControlToggle
              label="Methodology"
              options={ALGORITHM_TOGGLE_OPTIONS}
              value={algorithm}
              disabled={busy !== null}
              onChange={setAlgorithm}
              footnotes={ALGORITHM_FOOTNOTES}
              onFootnote={setHoveredFootnote}
            />
            <ControlToggle
              label="Tiles"
              options={RESOLUTION_TOGGLE_OPTIONS}
              value={resolution}
              disabled={busy !== null}
              onChange={setResolution}
            />
          </div>
          {hoveredFootnote && (
            <p className="w-0 min-w-full text-[11px] leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">{hoveredFootnote.term}</span> —{' '}
              {hoveredFootnote.description}
            </p>
          )}
        </div>
        <div className="shrink-0" style={{ width: 660, maxWidth: '100%' }}>
          <MosaicGrid
            ref={gridRef}
            image={image}
            tiles={trackCovers}
            resolution={resolution}
            algorithm={algorithm}
            onGrid={handleGrid}
          />
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
        <DownloadMenu
          busy={busy !== null}
          disabled={!grid || busy !== null}
          items={downloadItems}
        />
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
