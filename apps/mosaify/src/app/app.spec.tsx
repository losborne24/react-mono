import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './app';

function renderApp() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe('App', () => {
  it('should render successfully', () => {
    const { baseElement } = renderApp();
    expect(baseElement).toBeTruthy();
  });

  it('renders the Mosaify brand in the header', () => {
    const { getByText } = renderApp();
    expect(getByText('Mosaify')).toBeTruthy();
  });

  it('starts on the connect step before authentication', () => {
    const { getByText } = renderApp();
    expect(getByText(/Turn your music into art/i)).toBeTruthy();
  });

  it('renders the wizard step indicators', () => {
    const { getAllByText } = renderApp();
    for (const label of ['Connect', 'Playlist', 'Image', 'Mosaic']) {
      expect(getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('hides the connected badge while unauthenticated', () => {
    const { queryByText } = renderApp();
    expect(queryByText(/Connected as/i)).toBeNull();
  });
});
