import type { ReactNode } from 'react';
import { StepIndicator } from './step-indicator';

export interface WizardLayoutProps {
  /** Brand mark shown at header start. */
  brand: ReactNode;
  /** Optional content shown at header end (e.g. connected status). */
  headerAction?: ReactNode;
  /** 1-based current step, drives the step indicator. */
  stepNumber: number;
  children: ReactNode;
}

export function WizardLayout({
  brand,
  headerAction,
  stepNumber,
  children,
}: WizardLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col relative overflow-hidden">
      {/* Background texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(29,185,84,0.07) 0%, transparent 60%)',
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-6 pb-0">
        {brand}
        {headerAction}
      </header>

      {/* Step indicator */}
      <div className="relative z-10">
        <StepIndicator current={stepNumber} />
      </div>

      {/* Step content */}
      <main className="relative z-10 flex flex-col flex-1">{children}</main>
    </div>
  );
}
