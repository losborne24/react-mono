import { Stepper } from '@react-mono/shared-ui';

export interface Step {
  n: number;
  label: string;
}

export const STEPS: Step[] = [
  { n: 1, label: 'Connect' },
  { n: 2, label: 'Playlist' },
  { n: 3, label: 'Image' },
  { n: 4, label: 'Mosaic' },
];

export interface StepIndicatorProps {
  current: number;
  steps?: Step[];
}

/** Mosaify's 4-step indicator — thin wrapper over the shared `Stepper`. */
export function StepIndicator({ current, steps = STEPS }: StepIndicatorProps) {
  return <Stepper current={current} steps={steps} />;
}

export default StepIndicator;
