/** Capture beforeinstallprompt au chargement, pas seulement sur Mon profil. */

import type { BeforeInstallPromptEventLike } from '@/lib/pwaInstall';

let deferred: BeforeInstallPromptEventLike | null = null;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function getCapturedPwaPrompt(): BeforeInstallPromptEventLike | null {
  return deferred;
}

export function subscribeCapturedPwaPrompt(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function takeCapturedPwaPrompt(): BeforeInstallPromptEventLike | null {
  const next = deferred;
  deferred = null;
  emit();
  return next;
}

export function markPwaInstalled(): void {
  deferred = null;
  emit();
}

export function capturePwaInstallPrompt(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEventLike;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    markPwaInstalled();
  });
}
