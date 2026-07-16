import { useCallback, useMemo, useState } from 'react';

export interface UseStepperOptions {
  /** Total number of steps. Must be >= 1. */
  count: number;
  /** 0-based starting index. Clamped to range. Default 0. */
  initial?: number;
}

export interface StepperState {
  /** 0-based current index. */
  index: number;
  /** 1-based step number, for display. */
  stepNumber: number;
  count: number;
  isFirst: boolean;
  isLast: boolean;
  canBack: boolean;
  canNext: boolean;
  /** Advance one step. No-op on the last step. */
  next: () => void;
  /** Go back one step. No-op on the first step. */
  back: () => void;
  /** Jump to a 0-based index. Clamped to range. */
  goTo: (index: number) => void;
  /** Return to the initial index. */
  reset: () => void;
}

const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);

/**
 * Headless step-state primitive. Owns only the current index and movement —
 * no UI, no domain logic. Compose it inside feature hooks that layer on their
 * own rules (e.g. auth-gated steps). Pair with the `Stepper` component for the
 * visual indicator.
 */
export function useStepper({ count, initial = 0 }: UseStepperOptions): StepperState {
  const max = Math.max(count - 1, 0);
  const [index, setIndex] = useState(() => clamp(initial, max));

  const goTo = useCallback((next: number) => setIndex(clamp(next, max)), [max]);
  const next = useCallback(() => setIndex((i) => clamp(i + 1, max)), [max]);
  const back = useCallback(() => setIndex((i) => clamp(i - 1, max)), [max]);
  const reset = useCallback(() => setIndex(clamp(initial, max)), [initial, max]);

  return useMemo(
    () => ({
      index,
      stepNumber: index + 1,
      count,
      isFirst: index === 0,
      isLast: index === max,
      canBack: index > 0,
      canNext: index < max,
      next,
      back,
      goTo,
      reset,
    }),
    [index, count, max, next, back, goTo, reset],
  );
}
