import { useCallback, useRef, useState, type ComponentProps } from 'react';
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
import {
  Button,
  ControlToggle,
  ICON_SIZE,
  DownloadMenu,
  type ToggleFootnote,
} from '@react-mono/shared-ui';
import { saveBlob } from '@react-mono/mosaify-util';

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

export interface MosaicProps {
  image: SourceImage;
  playlist: Playlist;
  /** Album artwork used as mosaic tiles. */
  trackCovers: SourceImage[];
  onReset: () => void;
}

/** Tile dimensions of the rendered mosaic, reported by MosaicGrid. */
interface GridSize {
  cols: number;
  rows: number;
}

/** An in-flight export; also drives the `busy` state and disabled controls. */
type ExportAction = 'download' | 'svg' | 'pdf' | 'share';

interface Stat {
  label: string;
  value: string;
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

function MosaicHeader({ imageLabel, playlistTitle }: { imageLabel: string; playlistTitle: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-2xl font-bold text-foreground mb-1">Your mosaic</h2>
      <p className="text-muted-foreground text-sm">
        {imageLabel} · recreated from <span className="text-foreground/80">{playlistTitle}</span>{' '}
        artwork
      </p>
    </div>
  );
}

interface MosaicControlsProps {
  algorithm: string;
  resolution: Resolution;
  disabled: boolean;
  footnote: ToggleFootnote | null;
  onAlgorithmChange: (value: string) => void;
  onResolutionChange: (value: Resolution) => void;
  onFootnote: (footnote: ToggleFootnote | null) => void;
}

/** The card of segmented controls (methodology, tile count) above the mosaic. */
function MosaicControls({
  algorithm,
  resolution,
  disabled,
  footnote,
  onAlgorithmChange,
  onResolutionChange,
  onFootnote,
}: MosaicControlsProps) {
  return (
    <div className="flex max-w-full flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex flex-col items-start justify-center gap-4 sm:flex-row sm:gap-8">
        <ControlToggle
          label="Methodology"
          options={ALGORITHM_TOGGLE_OPTIONS}
          value={algorithm}
          disabled={disabled}
          onChange={onAlgorithmChange}
          footnotes={ALGORITHM_FOOTNOTES}
          onFootnote={onFootnote}
        />
        <ControlToggle
          label="Tiles"
          options={RESOLUTION_TOGGLE_OPTIONS}
          value={resolution}
          disabled={disabled}
          onChange={onResolutionChange}
        />
      </div>
      {footnote && (
        <p className="w-0 min-w-full text-[11px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">{footnote.term}</span> — {footnote.description}
        </p>
      )}
    </div>
  );
}

function StatItem({ label, value }: Stat) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

/** Horizontal strip summarising the mosaic (grid size, tile count, artwork, methodology). */
function StatsStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="flex items-center gap-6 rounded-xl px-5 py-3 mb-6 border border-border bg-card">
      {stats.map((stat) => (
        <StatItem key={stat.label} label={stat.label} value={stat.value} />
      ))}
    </div>
  );
}

interface MosaicActionsProps {
  items: ComponentProps<typeof DownloadMenu>['items'];
  busy: ExportAction | null;
  hasGrid: boolean;
  onShare: () => void;
  onReset: () => void;
}

/** Download menu, share button, and reset control shown below the stats strip. */
function MosaicActions({ items, busy, hasGrid, onShare, onReset }: MosaicActionsProps) {
  const disabled = !hasGrid || busy !== null;
  return (
    <div className="flex items-center gap-3">
      <DownloadMenu busy={busy !== null} disabled={disabled} items={items} />
      <Button
        variant="outline"
        onClick={onShare}
        disabled={disabled}
        className="h-auto rounded-xl border-border bg-card px-5 py-2.5 font-semibold text-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
      >
        <IconShare2 size={ICON_SIZE.md} />
        {busy === 'share' ? 'Sharing…' : 'Share'}
      </Button>
      <Button
        variant="ghost"
        onClick={onReset}
        className="ml-auto h-auto rounded-xl border border-border px-4 py-2.5 text-muted-foreground hover:border-border/60 hover:bg-transparent hover:text-foreground"
      >
        <IconRefresh size={ICON_SIZE.sm} />
        Start over
      </Button>
    </div>
  );
}

export function Mosaic({ image, playlist, trackCovers, onReset }: MosaicProps) {
  const [grid, setGrid] = useState<GridSize | null>(null);
  const [resolution, setResolution] = useState<Resolution>(DEFAULT_RESOLUTION);
  const [algorithm, setAlgorithm] = useState<string>(DEFAULT_MATCH_ALGORITHM);
  const [hoveredFootnote, setHoveredFootnote] = useState<ToggleFootnote | null>(null);
  const handleGrid = useCallback((g: GridSize) => setGrid(g), []);
  const gridRef = useRef<MosaicGridHandle>(null);
  const [busy, setBusy] = useState<ExportAction | null>(null);

  const baseName = `mosaify-${slugify(playlist.title)}`;

  /** Render the mosaic via the given grid method and download it under baseName.ext. */
  const saveExport = async (render: () => Promise<Blob | null> | undefined, ext: string) => {
    const blob = await render();
    if (!blob) return;
    saveBlob(blob, `${baseName}.${ext}`);
  };

  const handleShare = async () => {
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
    saveBlob(blob, file.name);
  };

  /** Run an export action while reflecting its progress in `busy` (ignored if already busy). */
  const runAction = (action: ExportAction, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(action);
    fn().finally(() => setBusy(null));
  };

  const downloadItems = [
    {
      id: 'image',
      icon: <IconPhoto size={ICON_SIZE.md} />,
      label: 'Image',
      description: 'JPEG bitmap',
      onSelect: () => runAction('download', () => saveExport(() => gridRef.current?.toBlob(), 'jpg')),
    },
    {
      id: 'svg',
      icon: <IconFileTypeSvg size={ICON_SIZE.md} />,
      label: 'SVG',
      description: 'Vector — full 512px per tile',
      onSelect: () => runAction('svg', () => saveExport(() => gridRef.current?.toSvg(), 'svg')),
    },
    {
      id: 'pdf',
      icon: <IconFileTypePdf size={ICON_SIZE.md} />,
      label: 'PDF',
      description: 'Print-ready — 300 DPI tiles',
      onSelect: () => runAction('pdf', () => saveExport(() => gridRef.current?.toPdf(), 'pdf')),
    },
  ];

  const onShare = () => runAction('share', handleShare);

  const total = grid ? grid.cols * grid.rows : 0;
  const methodology = ALGORITHM_FOOTNOTES[algorithm];

  const stats: Stat[] = [
    { label: 'Grid', value: grid ? `${grid.cols} × ${grid.rows}` : '—' },
    { label: 'Tiles', value: total ? total.toLocaleString() : '—' },
    { label: 'Unique artwork', value: `${trackCovers.length}` },
    ...(methodology ? [{ label: 'Methodology', value: methodology.term }] : []),
  ];

  return (
    <div className="flex flex-col flex-1 px-6 pb-12 max-w-3xl mx-auto w-full">
      <MosaicHeader imageLabel={image.label} playlistTitle={playlist.title} />

      <div className="flex flex-col items-center gap-6 mb-6">
        <MosaicControls
          algorithm={algorithm}
          resolution={resolution}
          disabled={busy !== null}
          footnote={hoveredFootnote}
          onAlgorithmChange={setAlgorithm}
          onResolutionChange={setResolution}
          onFootnote={setHoveredFootnote}
        />
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

      <StatsStrip stats={stats} />

      <MosaicActions
        items={downloadItems}
        busy={busy}
        hasGrid={grid !== null}
        onShare={onShare}
        onReset={onReset}
      />
    </div>
  );
}

export default Mosaic;
