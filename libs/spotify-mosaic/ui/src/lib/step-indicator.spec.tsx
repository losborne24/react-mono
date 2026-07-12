import { render } from '@testing-library/react';
import { StepIndicator, STEPS } from './step-indicator';

describe('StepIndicator', () => {
  it('renders a label for every step', () => {
    const { getByText } = render(<StepIndicator current={1} completed={[]} />);
    STEPS.forEach((step) => {
      expect(getByText(step.label)).toBeTruthy();
    });
  });
});
