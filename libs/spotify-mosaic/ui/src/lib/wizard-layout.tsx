import type { ReactNode } from 'react';
import { StepIndicator } from './step-indicator';

export interface WizardLayoutProps {
  /** 1-based current step, drives the step indicator. */
  stepNumber: number;
  children: ReactNode;
}

/**
 * Wizard chrome: step indicator + step content. Brand-agnostic — the host
 * app owns the surrounding shell and header.
 */
export function WizardLayout({ stepNumber, children }: WizardLayoutProps) {
  return (
    <>
      {/* Step indicator */}
      <div className="relative z-10">
        <StepIndicator current={stepNumber} />
      </div>

      {/* Step content */}
      <main className="relative z-10 flex flex-col flex-1">{children}</main>
    </>
  );
}
