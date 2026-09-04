import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';
import { applySettings, loadSettings } from './coach/settings';
import './index.css';

// Stamp the saved theme on <html> before React's first paint, so a Midnight
// table never flashes Emerald on boot, and the card-style module var is seeded
// before any card renders.
applySettings(loadSettings());

// Installable and offline-capable. Registered only in production builds so the
// dev server never fights a stale cache; the worker is network-first for the
// shell, so a new deploy always wins the moment you are online.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline install is a bonus, never a blocker */
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
