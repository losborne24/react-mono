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

interface StepNodeProps {
  label: string;
  n: number;
  isDone: boolean;
  isCurrent: boolean;
}

function StepNode({ label, n, isDone, isCurrent }: StepNodeProps) {
  const isUpcoming = !isDone && !isCurrent;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300',
          isDone && 'bg-primary text-primary-foreground',
          isCurrent && 'bg-primary/20 text-primary border border-primary/60 ring-2 ring-primary/20',
          isUpcoming && 'bg-muted text-muted-foreground border border-border',
        )}
      >
        {isDone ? <IconCheck size={14} stroke={2.5} /> : n}
      </div>
      <span
        className={cn(
          'text-[11px] font-medium tracking-wide uppercase',
          isCurrent && 'text-primary',
          isDone && !isCurrent && 'text-foreground/60',
          isUpcoming && 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </div>
  );
}

function StepConnector({ isDone }: { isDone: boolean }) {
  return (
    <div
      className={cn(
        'w-16 h-px mx-2 mb-5 transition-all duration-500',
        isDone ? 'bg-primary/40' : 'bg-border',
      )}
    />
  );
}

interface StepItemProps {
  label: string;
  n: number;
  current: number;
  isLast: boolean;
}

function StepItem({ label, n, current, isLast }: StepItemProps) {
  const isDone = n < current;
  return (
    <div className="flex items-center">
      <StepNode label={label} n={n} isDone={isDone} isCurrent={n === current} />
      {!isLast && <StepConnector isDone={isDone} />}
    </div>
  );
}

/**
 * Presentational-only horizontal step indicator.
 */
export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <div className={cn('flex items-center justify-center py-8', className)}>
      {steps.map((step, i) => (
        <StepItem
          key={step.label + i}
          label={step.label}
          n={i + 1}
          current={current}
          isLast={i === steps.length - 1}
        />
      ))}
    </div>
  );
}

export default Stepper;
