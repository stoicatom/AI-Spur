import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './design-tokens.css';

const container = document.getElementById('settings-root');
if (!container) throw new Error('settings-root element not found');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
