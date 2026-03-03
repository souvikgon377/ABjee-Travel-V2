import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();

  const reloadKey = 'vite-preload-error-reloaded';
  const alreadyReloaded = sessionStorage.getItem(reloadKey) === '1';

  if (!alreadyReloaded) {
    sessionStorage.setItem(reloadKey, '1');
    window.location.reload();
  }
});

window.addEventListener('load', () => {
  sessionStorage.removeItem('vite-preload-error-reloaded');
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service Worker: enable only in production to avoid stale cache issues in development
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('✅ Service Worker registered successfully:', registration.scope);

          // Check for updates every hour
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000);
        })
        .catch((error) => {
          console.warn('❌ Service Worker registration failed:', error);
        });
    });
  } else {
    // Remove any previously registered SW in dev to prevent stale bundle/runtime mismatches
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .then(() => {
        if (import.meta.env.DEV) {
          console.log('🧹 Service workers unregistered for development');
        }
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.warn('Failed to unregister service workers in development:', error);
        }
      });
  }
}

