import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  IDLE_TIMEOUT_MS,
  IDLE_WARN_BEFORE_MS,
  readRememberSession,
  setAuthNotice,
} from '@/lib/sessionIdle';

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'wheel',
  'click',
];

/**
 * Suit l’activité uniquement si connecté et sans « Rester connecté ».
 * À 28 min : modale. À 30 min : signOut + notice pour l’écran de connexion.
 */
export default function SessionIdleGuard() {
  const { session, signOut } = useAuth();
  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(
    Math.ceil(IDLE_WARN_BEFORE_MS / 1000)
  );

  const lastActiveRef = useRef(Date.now());
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signingOutRef = useRef(false);
  const warningOpenRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (warnTimerRef.current) {
      clearTimeout(warnTimerRef.current);
      warnTimerRef.current = null;
    }
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const idleSignOut = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    clearTimers();
    setWarningOpen(false);
    warningOpenRef.current = false;
    setAuthNotice('idle');
    try {
      await supabase.auth.stopAutoRefresh();
    } catch {
      /* non bloquant */
    }
    try {
      await signOut();
    } catch {
      /* session déjà invalidée */
    } finally {
      signingOutRef.current = false;
    }
  }, [clearTimers, signOut]);

  const armTimers = useCallback(() => {
    clearTimers();
    const warnAt = Math.max(0, IDLE_TIMEOUT_MS - IDLE_WARN_BEFORE_MS);

    warnTimerRef.current = setTimeout(() => {
      warningOpenRef.current = true;
      setWarningOpen(true);
      setSecondsLeft(Math.ceil(IDLE_WARN_BEFORE_MS / 1000));
      void supabase.auth.stopAutoRefresh().catch(() => {});

      const deadline = Date.now() + IDLE_WARN_BEFORE_MS;
      countdownRef.current = setInterval(() => {
        const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setSecondsLeft(left);
        if (left <= 0 && countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      }, 250);

      logoutTimerRef.current = setTimeout(() => {
        void idleSignOut();
      }, IDLE_WARN_BEFORE_MS);
    }, warnAt);
  }, [clearTimers, idleSignOut]);

  const bumpActivity = useCallback(() => {
    if (!session || readRememberSession() || signingOutRef.current) return;
    // Pendant la modale, seule une action explicite (bouton) réarme.
    if (warningOpenRef.current) return;

    const now = Date.now();
    if (now - lastActiveRef.current < 1000) return;
    lastActiveRef.current = now;
    armTimers();
  }, [armTimers, session]);

  const staySignedIn = useCallback(() => {
    warningOpenRef.current = false;
    setWarningOpen(false);
    lastActiveRef.current = Date.now();
    void supabase.auth.startAutoRefresh().catch(() => {});
    void supabase.auth.refreshSession().catch(() => {});
    armTimers();
  }, [armTimers]);

  useEffect(() => {
    if (!session) {
      clearTimers();
      setWarningOpen(false);
      warningOpenRef.current = false;
      return;
    }

    if (readRememberSession()) {
      clearTimers();
      setWarningOpen(false);
      warningOpenRef.current = false;
      void supabase.auth.startAutoRefresh().catch(() => {});
      return;
    }

    lastActiveRef.current = Date.now();
    armTimers();
    void supabase.auth.startAutoRefresh().catch(() => {});

    const onActivity = () => bumpActivity();
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true, capture: true });
    }
    return () => {
      clearTimers();
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity, true);
      }
    };
  }, [session, armTimers, bumpActivity, clearTimers]);

  if (!warningOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-idle-title"
      aria-describedby="session-idle-desc"
    >
      <div className="absolute inset-0 bg-slate-900/50" aria-hidden />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl border border-rose-100 animate-fadeIn space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <p
              id="session-idle-title"
              className="text-sm font-semibold text-gray-900 leading-snug"
            >
              Déconnexion imminente
            </p>
            <p
              id="session-idle-desc"
              className="text-sm text-gray-600 leading-relaxed"
            >
              Vous allez être déconnecté dans{' '}
              <span className="font-semibold text-gray-900 tabular-nums">
                {secondsLeft} s
              </span>{' '}
              pour inactivité. Cliquez ci-dessous pour rester connecté.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={staySignedIn}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white text-sm font-semibold shadow-lg shadow-rose-200 hover:shadow-rose-300 hover:scale-[1.01] active:scale-[0.99] transition-all"
        >
          Rester connecté
        </button>
      </div>
    </div>,
    document.body
  );
}
