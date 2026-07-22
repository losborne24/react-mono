import { useState } from 'react';
import { IconUpload, IconX } from '@tabler/icons-react';

import { Button } from './button';
import { ICON_SIZE } from './icon-size';
import { Input } from './input';
import { cn } from './utils';

export interface UploadZoneProps {
  /** Currently uploaded file, or null. Controlled by the parent. */
  file: File | null;
  /** Preview URL for the current file, or null. */
  url: string | null;
  /** Accept a picked/dropped file. */
  onFile: (file: File) => void;
  /** Clear the current file. */
  onClear: () => void;
  /** Ref for the underlying file input — bind `useImageUpload().inputRef`. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Accepted file types. Defaults to any image. */
  accept?: string;
  /** Prompt text shown before a file is chosen. */
  label?: React.ReactNode;
  className?: string;
}

export interface FilePreviewProps {
  name: string;
  url: string;
  sizeBytes: number;
  onClear: () => void;
  className?: string;
}

export function FilePreview({ name, url, sizeBytes, onClear, className }: FilePreviewProps) {
  return (
    <div data-slot="file-preview" className={cn('flex items-center gap-3', className)}>
      <img src={url} alt={name} className="w-8 h-8 rounded object-cover" />
      <span className="text-sm text-foreground font-medium truncate max-w-[200px]">{name}</span>
      <span className="text-xs text-muted-foreground">({(sizeBytes / 1024).toFixed(0)} KB)</span>
      <Button
        variant="ghost"
        size="icon"
        className="ml-1 size-6 text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        aria-label="Remove file"
      >
        <IconX size={ICON_SIZE.sm} />
      </Button>
    </div>
  );
}

function UploadPrompt({ label }: { label: React.ReactNode }) {
  return (
    <>
      <IconUpload size={ICON_SIZE.md} className="text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </>
  );
}

const DEFAULT_LABEL = (
  <>
    Drop an image or <span className="text-primary underline underline-offset-2">browse files</span>
  </>
);

export function UploadZone({
  file,
  url,
  onFile,
  onClear,
  inputRef,
  accept = 'image/*',
  label = DEFAULT_LABEL,
  className,
}: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);

  const hasFile = file && url;

  return (
    <div
      data-slot="upload-zone"
      data-dragging={dragging}
      data-has-file={!!hasFile}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) onFile(dropped);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex items-center justify-center gap-3 rounded-xl py-4 cursor-pointer border border-dashed transition-all duration-200',
        dragging || hasFile ? 'border-primary bg-primary/5' : 'border-border bg-transparent',
        className,
      )}
    >
      {hasFile ? (
        <FilePreview name={file.name} url={url} sizeBytes={file.size} onClear={onClear} />
      ) : (
        <UploadPrompt label={label} />
      )}
      <Input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onFile(picked);
        }}
      />
    </div>
  );
}
