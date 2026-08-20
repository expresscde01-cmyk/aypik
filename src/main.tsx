import './lib/disableNavigatorLocks';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// DEV : expose `__testPaymentSubs()` dans la console navigateur
if (import.meta.env.DEV) {
  void import('@/lib/debugPaymentSubscriptions');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
