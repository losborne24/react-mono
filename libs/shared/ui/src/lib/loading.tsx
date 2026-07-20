import { IconLoader2 } from '@tabler/icons-react';

import { ICON_SIZE } from './icon-size';

export interface LoadingProps {
  label?: string;
  size?: number;
  className?: string;
}

export function Loading({ label, size = ICON_SIZE.lg, className }: LoadingProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={['inline-flex items-center gap-2 text-muted-foreground', className]
        .filter(Boolean)
        .join(' ')}
    >
      <IconLoader2 size={size} className="animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}

export default Loading;
