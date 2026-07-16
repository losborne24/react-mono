import { useRef, useState } from 'react';
import {
  IconUpload,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';
import type { SourceImage } from '@react-mono/models';

export interface SelectImageProps {
  images: SourceImage[];
  selected: SourceImage | null;
  onSelect: (image: SourceImage) => void;
  onGenerate: () => void;
  /** Go to the previous step; hidden when omitted. */
  onBack?: () => void;
}

export function SelectImage({
  images,
  selected,
  onSelect,
  onGenerate,
  onBack,
}: SelectImageProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

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
          background: dragging ? 'rgba(29,185,84,0.05)' : 'transparent',
        }}
      >
        <IconUpload size={16} className="text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Drop an image or{' '}
          <span className="text-primary underline underline-offset-2">
            browse files
          </span>
        </span>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" />
      </div>

      {/* Sample images */}
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
        Or choose a sample
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 mb-8">
        {images.map((img) => {
          const isSelected = selected?.id === img.id;
          return (
            <button
              key={img.id}
              onClick={() => onSelect(img)}
              className="group relative rounded-lg overflow-hidden aspect-square border-2 transition-all duration-200 cursor-pointer"
              style={{
                borderColor: isSelected ? 'var(--primary)' : 'transparent',
              }}
              aria-pressed={isSelected}
            >
              <img
                src={img.thumbUrl}
                alt={img.label}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {isSelected && (
                <div className="absolute inset-0 bg-primary/25 flex items-end justify-start p-1.5">
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <IconCheck size={11} className="text-black" stroke={3} />
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-1.5">
                <span className="text-[10px] text-white font-medium">
                  {img.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-auto">
        {selected ? (
          <p className="text-sm text-muted-foreground">
            <span className="text-primary font-medium">{selected.label}</span>{' '}
            selected
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No image selected</p>
        )}
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm text-muted-foreground hover:text-foreground border border-border hover:bg-muted/50 transition-all duration-200 cursor-pointer"
            >
              <IconChevronLeft size={16} />
              Back
            </button>
          )}
          <button
            onClick={onGenerate}
            disabled={!selected}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#1db954', color: '#000' }}
          >
            Generate Mosaic
            <IconChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default SelectImage;
