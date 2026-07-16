import type { ReactNode } from 'react';
import { IconChevronLeft } from '@tabler/icons-react';
import { StepIndicator } from './step-indicator';

export interface WizardLayoutProps {
  /** 1-based current step, drives the step indicator. */
  stepNumber: number;
  /** Go to the previous step; the Back control is hidden when omitted. */
  onBack?: () => void;
  children: ReactNode;
}

/**
 * Wizard chrome: step indicator, optional Back control + step content.
 * Brand-agnostic — the host app owns the surrounding shell and header.
 */
export function WizardLayout({ stepNumber, onBack, children }: WizardLayoutProps) {
  return (
    <>
      {/* Step indicator */}
      <div className="relative z-10">
        <StepIndicator current={stepNumber} />
      </div>

      {/* Back control */}
      {onBack && (
        <div className="relative z-10 px-6 max-w-3xl mx-auto w-full">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 py-2 rounded-xl font-semibold text-sm text-muted-foreground hover:text-foreground transition-all duration-200 cursor-pointer"
          >
            <IconChevronLeft size={16} />
            Back
          </button>
        </div>
      )}

      {/* Step content */}
      <main className="relative z-10 flex flex-col flex-1">{children}</main>
    </>
  );
}
