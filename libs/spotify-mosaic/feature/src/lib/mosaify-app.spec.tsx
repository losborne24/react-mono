import { render } from '@testing-library/react';
import { MosaifyApp } from './mosaify-app';

describe('MosaifyApp', () => {
  it('starts on the connect step', () => {
    const { getByText } = render(<MosaifyApp />);
    expect(getByText(/Turn your music into art/i)).toBeTruthy();
    expect(getByText(/Connect with Spotify/i)).toBeTruthy();
  });
});
