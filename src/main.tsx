import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';
import { applySettings, loadSettings } from './coach/settings';
import './index.css';

// Stamp the saved theme on <html> before React's first paint, so a Midnight
// table never flashes Emerald on boot, and the card-style module var is seeded
// before any card renders.
applySettings(loadSettings());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
