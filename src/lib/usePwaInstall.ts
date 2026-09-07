import { useCallback, useEffect, useRef, useState } from 'react';
import {
  resolvePwaInstallKind,
  isStandaloneDisplay,
  type BeforeInstallPromptEventLike,
  type PwaInstallKind,
} from '@/lib/pwaInstall';

function readStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const display = window.matchMedia('(display-mode: standalone)').matches;
  const ios = Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone
  );
  return isStandaloneDisplay({
    displayModeStandalone: display,
    iosStandalone: ios,
  });
}

export function usePwaInstall(): {
  kind: PwaInstallKind;
  promptInstall: () => Promise<void>;
} {
  const deferredRef = useRef<BeforeInstallPromptEventLike | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [standalone, setStandalone] = useState(readStandalone);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEventLike;
      deferredRef.current = promptEvent;
      setCanPrompt(true);
    };
    const onInstalled = () => {
      deferredRef.current = null;
      setCanPrompt(false);
      setStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const pending = deferredRef.current;
    if (!pending) return;
    deferredRef.current = null;
    setCanPrompt(false);
    await pending.prompt();
    try {
      const choice = await pending.userChoice;
      if (choice.outcome === 'accepted') setStandalone(true);
    } catch {
      /* Chromium peut fermer le flux sans userChoice */
    }
  }, []);

  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const maxTouchPoints =
    typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints || 0;
  const kind = resolvePwaInstallKind({
    standalone,
    userAgent: ua,
    maxTouchPoints,
    canPrompt,
  });

  return { kind, promptInstall };
}
