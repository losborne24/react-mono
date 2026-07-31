import { Button, type ButtonProps } from './button';

export interface ToggleButtonProps extends Omit<ButtonProps, 'variant'> {
  /** Whether the button is in the pressed/on state. */
  selected?: boolean;
  /** Variant rendered when selected. Defaults to 'secondary'. */
  selectedVariant?: ButtonProps['variant'];
  /** Variant rendered when not selected. Defaults to 'outline'. */
  unselectedVariant?: ButtonProps['variant'];
}

/**
 * A two-state toggle button. Presentational only: the caller owns `selected`
 * and wires up `onClick`. Compose several inside a `ButtonGroup` to build a
 * segmented control.
 */
export function ToggleButton({
  selected = false,
  selectedVariant = 'secondary',
  unselectedVariant = 'outline',
  size = 'sm',
  ...props
}: ToggleButtonProps) {
  return (
    <Button
      type="button"
      data-slot="toggle-button"
      data-state={selected ? 'on' : 'off'}
      aria-pressed={selected}
      variant={selected ? selectedVariant : unselectedVariant}
      size={size}
      {...props}
    />
  );
}
