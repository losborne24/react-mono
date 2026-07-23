import { IconChevronRight, IconLoader2 } from '@tabler/icons-react';
import type { SourceImage } from '@react-mono/models';
import { Button, ICON_SIZE, UploadZone, useImageUpload } from '@react-mono/shared-ui';
import { SelectableThumb } from '@react-mono/mosaify-ui';

/** Stable id for the uploaded image, so samples never match it in the grid. */
const UPLOAD_ID = 'uploaded-image';

export interface SelectImageProps {
  images: SourceImage[];
  selected: SourceImage | null;
  onSelect: (image: SourceImage | null) => void;
  onGenerate: () => void;
  /** Playlist artwork still fetching — Generate stays disabled until done. */
  trackCoversLoading: boolean;
  /** Track covers loaded so far. */
  trackCoversLoaded: number;
  /** Total tracks in the selected playlist. */
  trackCount: number;
}

interface SampleThumbProps {
  image: SourceImage;
  selected: boolean;
  onSelect: (image: SourceImage) => void;
}

function SampleThumb({ image, selected, onSelect }: SampleThumbProps) {
  return (
    <button
      onClick={() => onSelect(image)}
      className="group rounded-lg overflow-hidden aspect-square border-2 transition-all duration-200 cursor-pointer"
      style={{
        borderColor: selected ? 'var(--primary-selected)' : 'transparent',
      }}
      aria-pressed={selected}
    >
      <SelectableThumb selected={selected} className="rounded-md">
        <img
          src={image.url}
          alt={image.label}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-1.5">
          <span className="text-[10px] text-white font-medium">{image.label}</span>
        </div>
      </SelectableThumb>
    </button>
  );
}

interface SampleGridProps {
  images: SourceImage[];
  selected: SourceImage | null;
  onSelect: (image: SourceImage) => void;
}

function SampleGrid({ images, selected, onSelect }: SampleGridProps) {
  return (
    <div className="grid grid-cols-4 gap-2.5 mb-8">
      {images.map((img) => (
        <SampleThumb
          key={img.id}
          image={img}
          selected={selected?.id === img.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

interface SelectionFooterProps {
  selected: SourceImage | null;
  onGenerate: () => void;
  trackCoversLoading: boolean;
  trackCoversLoaded: number;
  trackCount: number;
}

function SelectionFooter({
  selected,
  onGenerate,
  trackCoversLoading,
  trackCoversLoaded,
  trackCount,
}: SelectionFooterProps) {
  const remaining = trackCount - trackCoversLoaded;
  return (
    <div className="flex items-center justify-between mt-auto">
      {selected ? (
        <p className="text-sm text-muted-foreground">
          <span className="text-primary font-medium">{selected.label}</span> selected
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No image selected</p>
      )}
      <div className="flex items-center gap-2">
        <Button
          onClick={onGenerate}
          disabled={!selected || trackCoversLoading}
          variant="spotify"
          size="lg"
          className="rounded-xl"
        >
          {trackCoversLoading ? (
            <>
              <IconLoader2 size={ICON_SIZE.md} className="animate-spin" />
              Loading track covers ({remaining} remaining)
            </>
          ) : (
            <>
              Generate Mosaic
              <IconChevronRight size={ICON_SIZE.md} />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function SelectImage({
  images,
  selected,
  onSelect,
  onGenerate,
  trackCoversLoading,
  trackCoversLoaded,
  trackCount,
}: SelectImageProps) {
  // Upload and sample selection share one `selected` slot, so choosing one
  // replaces the other — mutual exclusion falls out of the single source of truth.
  const upload = useImageUpload((file, url) => {
    onSelect(file && url ? { id: UPLOAD_ID, url, label: file.name } : null);
  });

  const handleSelectSample = (image: SourceImage) => {
    upload.clear();
    onSelect(image);
  };

  return (
    <div className="flex flex-col flex-1 px-6 pb-12 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold text-foreground mb-1">
          Pick a target image
        </h2>
        <p className="text-muted-foreground text-sm">
          This photo will be recreated using your playlist&apos;s artwork as tiles.
        </p>
      </div>

      {/* Upload zone */}
      <UploadZone
        file={upload.file}
        url={upload.url}
        onFile={upload.setFile}
        onClear={upload.clear}
        inputRef={upload.inputRef}
        className="mb-5"
      />

      {/* Sample images */}
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
        Or choose a sample
      </p>
      <SampleGrid images={images} selected={selected} onSelect={handleSelectSample} />

      <SelectionFooter
        selected={selected}
        onGenerate={onGenerate}
        trackCoversLoading={trackCoversLoading}
        trackCoversLoaded={trackCoversLoaded}
        trackCount={trackCount}
      />
    </div>
  );
}

export default SelectImage;
