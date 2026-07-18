import { render } from '@testing-library/react';
import { ConnectToSpotify } from './connect-to-spotify';

describe('ConnectToSpotify', () => {
  it('renders the connect prompt', () => {
    const { getByText } = render(<ConnectToSpotify onConnect={() => undefined} />);
    expect(getByText(/Turn your music into art/i)).toBeTruthy();
    expect(getByText(/Connect with Spotify/i)).toBeTruthy();
  });
});
