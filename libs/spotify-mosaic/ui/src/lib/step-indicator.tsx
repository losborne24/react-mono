import { Check } from 'lucide-react';

export interface Step {
  n: number;
  label: string;
}

export const STEPS: Step[] = [
  { n: 1, label: 'Connect' },
  { n: 2, label: 'Album' },
  { n: 3, label: 'Image' },
  { n: 4, label: 'Mosaic' },
];

export interface StepIndicatorProps {
  current: number;
  completed: number[];
  steps?: Step[];
}

export function StepIndicator({
  current,
  completed,
  steps = STEPS,
}: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-0 justify-center py-8">
      {steps.map((step, i) => {
        const isDone = completed.includes(step.n);
        const isCurrent = current === step.n;
        return (
          <div key={step.n} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={[
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300',
                  isDone
                    ? 'bg-primary text-primary-foreground'
                    : isCurrent
                    ? 'bg-primary/20 text-primary border border-primary/60 ring-2 ring-primary/20'
                    : 'bg-muted text-muted-foreground border border-border',
                ].join(' ')}
              >
                {isDone ? <Check size={14} strokeWidth={2.5} /> : step.n}
              </div>
              <span
                className={[
                  'text-[11px] font-medium tracking-wide uppercase',
                  isCurrent
                    ? 'text-primary'
                    : isDone
                    ? 'text-foreground/60'
                    : 'text-muted-foreground',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={[
                  'w-16 h-px mx-2 mb-5 transition-all duration-500',
                  isDone ? 'bg-primary/40' : 'bg-border',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default StepIndicator;
