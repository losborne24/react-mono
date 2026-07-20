/**
 * Standard icon sizes (px) for @tabler/icons-react and custom icon components.
 *
 * Use these instead of hardcoded numbers so icon scale stays consistent
 * across the workspace. Pass to an icon's `size` prop, e.g.
 * `<IconX size={ICON_SIZE.md} />`.
 */
export const ICON_SIZE = {
  /** Badges, tiny overlays. */
  xs: 12,
  /** Checkmarks, step indicators, small accents. */
  sm: 14,
  /** Default UI icons: nav, search, close, buttons. */
  md: 16,
  /** Spinners, emphasised icons. */
  lg: 20,
  /** Hero / feature graphics. */
  xl: 44,
} as const;

export type IconSize = (typeof ICON_SIZE)[keyof typeof ICON_SIZE];
