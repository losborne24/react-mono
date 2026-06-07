import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

// App owns its own HashRouter (Spotify PKCE redirect lands on `/?code=...`).
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
