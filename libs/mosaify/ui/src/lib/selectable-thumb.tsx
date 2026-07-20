import type { ReactNode } from 'react';
import { IconCheck } from '@tabler/icons-react';
import { ICON_SIZE } from '@react-mono/shared-ui';

export interface SelectableThumbProps {
  /** Whether this thumbnail is currently selected. */
  selected: boolean;
  /** Thumbnail content, typically an `<img>`. */
  children: ReactNode;
  /** Extra classes for the thumbnail box. */
  className?: string;
}

/**
 * Square image thumbnail with a shared "selected" treatment: a primary-tinted
 * overlay and a centered check badge. Used by any card that lets the user pick
 * an image (playlist artwork, sample target images, …).
 */
export function SelectableThumb({ selected, children, className }: SelectableThumbProps) {
  return (
    <div
      className={`relative rounded-lg overflow-hidden aspect-square bg-muted ${className ?? ''}`}
    >
      {children}
      {selected && (
        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg">
            <IconCheck size={ICON_SIZE.sm} className="text-black" stroke={2.5} />
          </div>
        </div>
      )}
    </div>
  );
}

export default SelectableThumb;
