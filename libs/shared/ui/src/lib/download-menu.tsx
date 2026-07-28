import * as React from 'react';
import { IconDownload, IconChevronDown } from '@tabler/icons-react';

import { Button, type ButtonProps } from './button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './dropdown-menu';
import { ICON_SIZE } from './icon-size';

export interface DownloadMenuItem {
  /** Stable identifier for the option (also used as the React key). */
  id: string;
  /** Leading icon element (e.g. a Tabler icon). */
  icon?: React.ReactNode;
  label: string;
  /** Optional muted second line describing the format. */
  description?: string;
  onSelect: () => void;
  disabled?: boolean;
}

export interface DownloadMenuProps {
  items: DownloadMenuItem[];
  /** Trigger label shown when idle. Defaults to "Download". */
  label?: React.ReactNode;
  /** Label shown while an action is running. Defaults to "Working…". */
  busyLabel?: React.ReactNode;
  /** Whether an action is currently running. */
  busy?: boolean;
  /** Disables the trigger and all items. */
  disabled?: boolean;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  align?: React.ComponentProps<typeof DropdownMenuContent>['align'];
  className?: string;
  contentClassName?: string;
}

/**
 * Presentational split of a "Download" button into a dropdown of export formats.
 * Dumb: all behaviour lives in each item's `onSelect`.
 */
export function DownloadMenu({
  items,
  label = 'Download',
  busyLabel = 'Working…',
  busy = false,
  disabled = false,
  variant = 'spotify',
  size = 'lg',
  align = 'start',
  className = 'rounded-xl',
  contentClassName = 'min-w-[13rem]',
}: DownloadMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className} disabled={disabled}>
          <IconDownload size={ICON_SIZE.md} />
          {busy ? busyLabel : label}
          <IconChevronDown size={ICON_SIZE.sm} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={contentClassName}>
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            disabled={item.disabled ?? disabled}
            onSelect={item.onSelect}
          >
            {item.icon}
            <div className="flex flex-col">
              <span className="font-medium">{item.label}</span>
              {item.description ? (
                <span className="text-xs text-muted-foreground">{item.description}</span>
              ) : null}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default DownloadMenu;
