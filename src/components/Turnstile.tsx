import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

/**
 * Widget Cloudflare Turnstile (CAPTCHA) — rendu explicite via window.turnstile.
 *
 * Le script officiel est chargé dynamiquement (une seule fois, même si
 * plusieurs widgets sont montés) depuis challenges.cloudflare.com.
 * Ce host doit être autorisé dans script-src ET frame-src de la CSP
 * (voir public/.htaccess) sinon le widget ne s'affichera jamais et aucun
 * token ne sera émis.
 */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const SCRIPT_ID = 'cf-turnstile-script';

type TurnstileWidgetId = string;

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: TurnstileRenderOptions
      ) => TurnstileWidgetId;
      reset: (widgetId?: TurnstileWidgetId) => void;
      remove: (widgetId?: TurnstileWidgetId) => void;
    };
    __turnstileOnLoadCallbacks?: Array<() => void>;
  }
}

function loadTurnstileScript(onReady: () => void): void {
  if (typeof window === 'undefined') return;
  if (window.turnstile) {
    onReady();
    return;
  }
  window.__turnstileOnLoadCallbacks = window.__turnstileOnLoadCallbacks || [];
  window.__turnstileOnLoadCallbacks.push(onReady);

  if (document.getElementById(SCRIPT_ID)) return;

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = `${SCRIPT_SRC}?onload=__onTurnstileLoad`;
  script.async = true;
  script.defer = true;
  (window as unknown as Record<string, unknown>).__onTurnstileLoad = () => {
    (window.__turnstileOnLoadCallbacks || []).forEach((cb) => cb());
    window.__turnstileOnLoadCallbacks = [];
  };
  document.head.appendChild(script);
}

export interface TurnstileHandle {
  reset: () => void;
}

const Turnstile = forwardRef<
  TurnstileHandle,
  {
    siteKey: string;
    onVerify: (token: string) => void;
    onExpire?: () => void;
    className?: string;
  }
>(function Turnstile({ siteKey, onVerify, onExpire, className }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | null>(null);
  const [error, setError] = useState(false);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.reset(widgetIdRef.current);
      }
    },
  }));

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    loadTurnstileScript(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => {
          setError(false);
          onVerify(token);
        },
        'error-callback': () => {
          setError(true);
        },
        'expired-callback': () => {
          onExpire?.();
        },
        theme: 'light',
        language: 'fr',
      });
    });

    return () => {
      cancelled = true;
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <div>
      <div ref={containerRef} className={className} />
      {error && (
        <p className="mt-1.5 text-xs text-red-500">
          Le CAPTCHA n&apos;a pas pu se charger. Réessaie ou recharge la page.
        </p>
      )}
    </div>
  );
});

export default Turnstile;
