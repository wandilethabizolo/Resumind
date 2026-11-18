import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (!import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().catch(() => {});
      }
    })
    .catch(() => {});
}

createRoot(document.getElementById('root')!).render(<App />);
