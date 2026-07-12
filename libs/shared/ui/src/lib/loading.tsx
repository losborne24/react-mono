import { Loader2 } from 'lucide-react';

export interface LoadingProps {
  label?: string;
  size?: number;
  className?: string;
}

export function Loading({ label, size = 18, className }: LoadingProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={['inline-flex items-center gap-2 text-muted-foreground', className]
        .filter(Boolean)
        .join(' ')}
    >
      <Loader2 size={size} className="animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}

export default Loading;
