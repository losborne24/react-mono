import { render } from '@testing-library/react';
import { Stepper } from './stepper';

const STEPS = [{ label: 'One' }, { label: 'Two' }, { label: 'Three' }];

describe('Stepper', () => {
  it('renders a label for every step', () => {
    const { getByText } = render(<Stepper steps={STEPS} current={1} />);
    STEPS.forEach((s) => expect(getByText(s.label)).toBeTruthy());
  });

  it('shows the number for upcoming/current steps and hides it for done ones', () => {
    const { getByText, queryByText } = render(<Stepper steps={STEPS} current={2} />);
    // step 2 is current -> shows its number; step 3 upcoming -> shows its number
    expect(getByText('2')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    // step 1 is done -> number replaced by a check icon
    expect(queryByText('1')).toBeNull();
  });
});
