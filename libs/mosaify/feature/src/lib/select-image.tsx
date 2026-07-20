import { useRef, useState } from 'react';
import { IconUpload, IconChevronRight } from '@tabler/icons-react';
import type { SourceImage } from '@react-mono/models';
import { Button, ICON_SIZE } from '@react-mono/shared-ui';
import { SelectableThumb } from '@react-mono/mosaify-ui';

export interface SelectImageProps {
  images: SourceImage[];
  selected: SourceImage | null;
  onSelect: (image: SourceImage) => void;
  onGenerate: () => void;
}

function UploadZone() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onClick={() => fileRef.current?.click()}
      className="flex items-center justify-center gap-3 rounded-xl py-4 mb-5 cursor-pointer border border-dashed transition-all duration-200"
      style={{
        borderColor: dragging ? 'var(--primary)' : 'var(--border)',
        background: dragging ? 'var(--primary-selected-bg)' : 'transparent',
      }}
    >
      <IconUpload size={ICON_SIZE.md} className="text-muted-foreground" />
      <span className="text-sm text-muted-foreground">
        Drop an image or{' '}
        <span className="text-primary underline underline-offset-2">browse files</span>
      </span>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" />
    </div>
  );
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
}

function SelectionFooter({ selected, onGenerate }: SelectionFooterProps) {
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
          disabled={!selected}
          variant="spotify"
          size="lg"
          className="rounded-xl"
        >
          Generate Mosaic
          <IconChevronRight size={ICON_SIZE.md} />
        </Button>
      </div>
    </div>
  );
}

export function SelectImage({ images, selected, onSelect, onGenerate }: SelectImageProps) {
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
      <UploadZone />

      {/* Sample images */}
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
        Or choose a sample
      </p>
      <SampleGrid images={images} selected={selected} onSelect={onSelect} />

      <SelectionFooter selected={selected} onGenerate={onGenerate} />
    </div>
  );
}

export default SelectImage;
