import { Button, type ButtonProps } from './button';
import { cn } from './utils';

export interface IconButtonProps extends Omit<ButtonProps, 'size'> {
  /** Square footprint of the control. Defaults to 'md'. */
  size?: 'sm' | 'md' | 'lg';
}

const iconButtonSize = {
  sm: 'size-6',
  md: 'size-8',
  lg: 'size-9',
} as const;

/**
 * An icon-only button. Wraps `Button` with a square footprint and a ghost
 * look by default (a muted icon that resolves to `foreground` on hover, plus
 * the shared focus-visible ring). Pass a single icon as the child and always
 * provide `aria-label`. Override colour/positioning via `className`.
 */
export function IconButton({
  size = 'md',
  variant = 'ghost',
  className,
  ...props
}: IconButtonProps) {
  return (
    <Button
      type="button"
      data-slot="icon-button"
      variant={variant}
      size="icon"
      className={cn(iconButtonSize[size], 'text-muted-foreground hover:text-foreground', className)}
      {...props}
    />
  );
}
