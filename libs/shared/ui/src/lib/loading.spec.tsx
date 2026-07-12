import { render } from '@testing-library/react';
import { Loading } from './loading';

describe('Loading', () => {
  it('renders a status region', () => {
    const { getByRole } = render(<Loading />);
    expect(getByRole('status')).toBeTruthy();
  });

  it('renders the label when provided', () => {
    const { getByText } = render(<Loading label="Connecting…" />);
    expect(getByText('Connecting…')).toBeTruthy();
  });
});
