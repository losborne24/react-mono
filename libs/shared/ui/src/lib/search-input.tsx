import * as React from 'react';
import { IconSearch, IconX } from '@tabler/icons-react';

import { ICON_SIZE } from './icon-size';
import { IconButton } from './icon-button';
import { Input } from './input';
import { cn } from './utils';

export interface SearchInputProps extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> {
  /** Current query text. */
  value: string;
  /** Called with the new query as the user types, and with `''` when cleared. */
  onValueChange: (query: string) => void;
  /** Accessible label for the clear button. Defaults to 'Clear search'. */
  clearLabel?: string;
}

/**
 * A search field: a leading search icon, a text `Input`, and a trailing clear
 * button that appears once there is a query. Built on the shared `Input` so it
 * inherits the standard focus ring and disabled handling. Override styling via
 * `className` (applied to the input) — the wrapper stays `relative` so the
 * affordances stay positioned.
 */
export function SearchInput({
  value,
  onValueChange,
  clearLabel = 'Clear search',
  className,
  ...props
}: SearchInputProps) {
  const hasQuery = value.length > 0;
  return (
    <div className="relative">
      <IconSearch
        size={ICON_SIZE.md}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
      />
      <Input
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn('pl-9 pr-9', className)}
        {...props}
      />
      {hasQuery && (
        <IconButton
          size="sm"
          onClick={() => onValueChange('')}
          aria-label={clearLabel}
          className="absolute right-1.5 top-1/2 -translate-y-1/2"
        >
          <IconX size={ICON_SIZE.sm} />
        </IconButton>
      )}
    </div>
  );
}
