import { render } from '@testing-library/react';

import App from './app';

describe('App', () => {
  it('should render successfully', () => {
    // App provides its own HashRouter + SessionProvider.
    const { baseElement } = render(<App />);
    expect(baseElement).toBeTruthy();
  });

  it('should show the Spotify Mosaic heading on the landing route', () => {
    const { getByText } = render(<App />);
    expect(getByText('Spotify Mosaic')).toBeTruthy();
  });
});
