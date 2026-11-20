import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { applyStoredTheme } from './ui/theme';
import { startUpdates } from './ui/update';

applyStoredTheme();
import { db } from './db/db';
import { mergeHistory } from './db/backup';

// Bara i förhandsbygget (VITE_SEED=1): läs in historikfiler från src/seed/ en gång.
if (import.meta.env.VITE_SEED) {
  const files = import.meta.glob('./seed/*.json', { eager: true, import: 'default' });
  for (const f of Object.values(files)) void mergeHistory(db, f).catch(() => {});
}

startUpdates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
