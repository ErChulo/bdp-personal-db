import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/theme.css';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// A service worker needs an HTTP(S) origin. `npm run serve` provides one for
// local, disconnected use; file:// is intentionally unsupported by browsers.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    const url = new URL('sw.js', document.baseURI);
    navigator.serviceWorker.register(url, { scope: './' }).catch((error: unknown) => {
      console.warn('Offline cache registration failed:', error);
    });
  });
}
