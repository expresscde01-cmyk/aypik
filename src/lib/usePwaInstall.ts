import { useCallback, useEffect, useRef, useState } from 'react';
import {
  resolvePwaInstallKind,
  isStandaloneDisplay,
  type BeforeInstallPromptEventLike,
  type PwaInstallKind,
} from '@/lib/pwaInstall';
import {
  capturePwaInstallPrompt,
  getCapturedPwaPrompt,
  markPwaInstalled,
  subscribeCapturedPwaPrompt,
  takeCapturedPwaPrompt,
} from '@/lib/pwaPromptBridge';

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

function syncFromBridge(
  deferredRef: { current: BeforeInstallPromptEventLike | null },
  setCanPrompt: (value: boolean) => void
) {
  const captured = getCapturedPwaPrompt();
  deferredRef.current = captured;
  setCanPrompt(Boolean(captured));
}

export function usePwaInstall(): {
  kind: PwaInstallKind;
  promptInstall: () => Promise<void>;
} {
  const deferredRef = useRef<BeforeInstallPromptEventLike | null>(null);
  const [canPrompt, setCanPrompt] = useState(() => Boolean(getCapturedPwaPrompt()));
  const [standalone, setStandalone] = useState(readStandalone);

  useEffect(() => {
    capturePwaInstallPrompt();
    syncFromBridge(deferredRef, setCanPrompt);
    const unsub = subscribeCapturedPwaPrompt(() => {
      syncFromBridge(deferredRef, setCanPrompt);
    });
    const onInstalled = () => {
      markPwaInstalled();
      setStandalone(true);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      unsub();
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const pending = takeCapturedPwaPrompt() ?? deferredRef.current;
    if (!pending) return;
    deferredRef.current = null;
    setCanPrompt(false);
    await pending.prompt();
    try {
      const choice = await pending.userChoice;
      if (choice.outcome === 'accepted') {
        markPwaInstalled();
        setStandalone(true);
      }
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
