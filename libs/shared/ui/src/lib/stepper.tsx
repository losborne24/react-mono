import { IconCheck } from '@tabler/icons-react';

import { cn } from './utils';

export interface StepperStep {
  /** Short label shown under the node. */
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** 1-based current step. Steps below it render as done, above as upcoming. */
  current: number;
  className?: string;
}

/**
 * Brand-agnostic horizontal step indicator. Presentational only — drive
 * `current` from `useStepper` (or any 1-based counter). Styled with design
 * tokens so it inherits the host theme.
 */
export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <div className={cn('flex items-center gap-0 justify-center py-8', className)}>
      {steps.map((step, i) => {
        const n = i + 1;
        const isDone = n < current;
        const isCurrent = n === current;
        return (
          <div key={step.label + i} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300',
                  isDone
                    ? 'bg-primary text-primary-foreground'
                    : isCurrent
                      ? 'bg-primary/20 text-primary border border-primary/60 ring-2 ring-primary/20'
                      : 'bg-muted text-muted-foreground border border-border',
                )}
              >
                {isDone ? <IconCheck size={14} stroke={2.5} /> : n}
              </div>
              <span
                className={cn(
                  'text-[11px] font-medium tracking-wide uppercase',
                  isCurrent
                    ? 'text-primary'
                    : isDone
                      ? 'text-foreground/60'
                      : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'w-16 h-px mx-2 mb-5 transition-all duration-500',
                  isDone ? 'bg-primary/40' : 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default Stepper;
