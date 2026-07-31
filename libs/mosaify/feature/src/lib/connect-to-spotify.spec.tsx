import { fireEvent, render } from '@testing-library/react';
import { ConnectToSpotify } from './connect-to-spotify';

describe('ConnectToSpotify', () => {
  it('renders the connect prompt', () => {
    const { getByText } = render(<ConnectToSpotify onConnect={() => undefined} />);
    expect(getByText(/Turn your music into art/i)).toBeTruthy();
    expect(getByText(/Connect with Spotify/i)).toBeTruthy();
  });

  it('calls onConnect when the button is clicked', () => {
    const onConnect = vi.fn();
    const { getByText } = render(<ConnectToSpotify onConnect={onConnect} />);
    fireEvent.click(getByText(/Connect with Spotify/i));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('shows a checking state and disables the button while checking', () => {
    const onConnect = vi.fn();
    const { getByText, queryByText } = render(
      <ConnectToSpotify onConnect={onConnect} status="checking" />
    );
    expect(getByText(/Checking session/i)).toBeTruthy();
    expect(queryByText(/Connect with Spotify/i)).toBeNull();
    const button = getByText(/Checking session/i).closest('button');
    expect(button?.disabled).toBe(true);
    fireEvent.click(button as HTMLButtonElement);
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('warns and disables the button when Spotify is not configured', () => {
    const onConnect = vi.fn();
    const { getByText } = render(
      <ConnectToSpotify onConnect={onConnect} configured={false} />
    );
    expect(getByText(/Spotify isn't configured/i)).toBeTruthy();
    expect(getByText(/VITE_SPOTIFY_CLIENT_ID/i)).toBeTruthy();
    const button = getByText(/Connect with Spotify/i).closest('button');
    expect(button?.disabled).toBe(true);
    fireEvent.click(button as HTMLButtonElement);
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('renders an error message when provided', () => {
    const { getByText } = render(
      <ConnectToSpotify onConnect={() => undefined} error="Something went wrong" />
    );
    expect(getByText(/Something went wrong/i)).toBeTruthy();
  });

  it('does not render the configured warning or error by default', () => {
    const { queryByText } = render(<ConnectToSpotify onConnect={() => undefined} />);
    expect(queryByText(/isn't configured/i)).toBeNull();
    const button = queryByText(/Connect with Spotify/i)?.closest('button');
    expect(button?.disabled).toBe(false);
  });
});
