import { ButtonGroup } from './button-group';
import { ToggleButton } from './toggle-button';

export interface ToggleOption<T extends string | number> {
  value: T;
  label: string;
}

/** Short explanatory note shown beneath a toggle, with an emphasised lead-in term. */
export interface ToggleFootnote {
  term: string;
  description: string;
}

export interface ControlToggleProps<T extends string | number> {
  label: string;
  options: readonly ToggleOption<T>[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
  /** Optional per-option notes, keyed by option value; surfaced via onFootnote on hover. */
  footnotes?: Record<string, ToggleFootnote>;
  /** Reports the footnote for the hovered button (or null on leave), for the parent to render. */
  onFootnote?: (footnote: ToggleFootnote | null) => void;
}

/** Labelled segmented control: a row of toggle buttons under an uppercase label. */
export function ControlToggle<T extends string | number>({
  label,
  options,
  value,
  disabled,
  onChange,
  footnotes,
  onFootnote,
}: ControlToggleProps<T>) {
  const handleHover = (hovered: T | null) => {
    const footnote = hovered !== null ? footnotes?.[String(hovered)] ?? null : null;
    onFootnote?.(footnote);
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
        {label}
      </span>
      <ButtonGroup orientation="horizontal">
        {options.map((option) => (
          <ToggleButton
            key={String(option.value)}
            selected={option.value === value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            onMouseEnter={() => handleHover(option.value)}
            onMouseLeave={() => handleHover(null)}
          >
            {option.label}
          </ToggleButton>
        ))}
      </ButtonGroup>
    </div>
  );
}
