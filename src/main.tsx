import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { capturePwaInstallPrompt } from '@/lib/pwaPromptBridge';
import { bootstrapLocale } from '@/i18n/bootstrap';

bootstrapLocale();
capturePwaInstallPrompt();

// DEV : expose `__testPaymentSubs()` dans la console navigateur
if (import.meta.env.DEV) {
  void import('@/lib/debugPaymentSubscriptions');
}

const rootEl = document.getElementById('root')!;
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);

const bootShell = document.getElementById('aypik-boot-shell');
if (bootShell) {
  const hideBootShell = () => {
    if (!rootEl.childNodes.length) return;
    bootShell.remove();
  };
  hideBootShell();
  if (bootShell.isConnected) {
    const bootObs = new MutationObserver(() => {
      hideBootShell();
      if (!bootShell.isConnected) bootObs.disconnect();
    });
    bootObs.observe(rootEl, { childList: true });
  }
}

// En prod, index.php charge la police après le premier affichage.
if (import.meta.env.DEV) {
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href =
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(font);
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js?v=20261017-standalone', {
      scope: '/',
      updateViaCache: 'none',
    });
  });
}
