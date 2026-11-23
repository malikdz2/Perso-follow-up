import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { applyTheme, watchSystemTheme } from './lib/theme';
import { initInstallPrompt } from './lib/install';

applyTheme();
watchSystemTheme();
initInstallPrompt();

// Demande au navigateur de ne jamais effacer les données (IndexedDB) pour libérer de l'espace.
void navigator.storage?.persist?.();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
