import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  IDLE_WARN_BEFORE_MS,
  clearIdleCountdown,
  clearIdleForceLogout,
  initIdleWatchIfAbsent,
  isIdleStorageKey,
  isIdleWarningDue,
  markIdleForceLogout,
  readIdleForceLogout,
  readIdleWatch,
  readRememberSession,
  remainingIdleSeconds,
  setAuthNotice,
  writeIdleActivity,
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
 * Suit l’activité uniquement si connecté et sans « Rester connecté » (login).
 * lastActive / logoutAt sont en localStorage (tous les onglets).
 * Seule une activité réelle ou le bouton de la modale étend logoutAt.
 */
export default function SessionIdleGuard() {
  const { session, signOut, loading } = useAuth();
  const userId = session?.user?.id ?? null;

  const [warningOpen, setWarningOpen] = useState(() => {
    const state = readIdleWatch();
    return state != null && isIdleWarningDue(state.logoutAt);
  });
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const state = readIdleWatch();
    return state != null
      ? remainingIdleSeconds(state.logoutAt)
      : Math.ceil(IDLE_WARN_BEFORE_MS / 1000);
  });

  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signingOutRef = useRef(false);
  const warningOpenRef = useRef(warningOpen);
  const idleSignOutRef = useRef<() => void>(() => {});
  const applySharedWatchRef = useRef<(allowInit: boolean) => void>(() => {});
  const watchUserRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(session?.access_token ?? null);
  accessTokenRef.current = session?.access_token ?? null;

  const clearClockTimers = useCallback(() => {
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
    clearClockTimers();
    clearIdleCountdown();
    markIdleForceLogout(accessTokenRef.current);
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
  }, [clearClockTimers, signOut]);

  idleSignOutRef.current = () => {
    void idleSignOut();
  };

  const syncWarningClock = useCallback(
    (logoutAt: number) => {
      clearClockTimers();
      const tick = () => {
        const left = remainingIdleSeconds(logoutAt);
        setSecondsLeft(left);
        if (left <= 0) idleSignOutRef.current();
      };
      tick();
      countdownRef.current = setInterval(tick, 250);
      logoutTimerRef.current = setTimeout(() => {
        idleSignOutRef.current();
      }, Math.max(0, logoutAt - Date.now()));
    },
    [clearClockTimers]
  );

  const applySharedWatch = useCallback(
    (allowInit: boolean) => {
      if (signingOutRef.current) return;

      if (readRememberSession()) {
        warningOpenRef.current = false;
        setWarningOpen(false);
        clearClockTimers();
        return;
      }

      if (readIdleForceLogout(accessTokenRef.current)) {
        idleSignOutRef.current();
        return;
      }

      let state = readIdleWatch();
      if (!state) {
        if (!allowInit) {
          // Clé absente ≠ déconnexion : seul le marqueur force-logout (déjà
          // testé plus haut) signale un idle sign-out inter-onglets.
          warningOpenRef.current = false;
          setWarningOpen(false);
          clearClockTimers();
          return;
        }
        state = initIdleWatchIfAbsent();
      }

      const now = Date.now();
      if (now >= state.logoutAt) {
        idleSignOutRef.current();
        return;
      }

      if (isIdleWarningDue(state.logoutAt, now)) {
        warningOpenRef.current = true;
        setWarningOpen(true);
        void supabase.auth.stopAutoRefresh().catch(() => {});
        syncWarningClock(state.logoutAt);
        return;
      }

      warningOpenRef.current = false;
      setWarningOpen(false);
      void supabase.auth.startAutoRefresh().catch(() => {});
      clearClockTimers();
      warnTimerRef.current = setTimeout(() => {
        applySharedWatchRef.current(false);
      }, Math.max(0, state.logoutAt - IDLE_WARN_BEFORE_MS - now));
    },
    [clearClockTimers, syncWarningClock]
  );

  applySharedWatchRef.current = applySharedWatch;

  const bumpActivity = useCallback(() => {
    if (!userId || readRememberSession() || signingOutRef.current) return;
    const state = readIdleWatch();
    if (warningOpenRef.current || (state != null && isIdleWarningDue(state.logoutAt))) {
      return;
    }

    const now = Date.now();
    if (state != null && now - state.lastActiveAt < 1000) return;
    writeIdleActivity(now);
    applySharedWatch(false);
  }, [applySharedWatch, userId]);

  const staySignedIn = useCallback(() => {
    warningOpenRef.current = false;
    setWarningOpen(false);
    writeIdleActivity(Date.now());
    void supabase.auth.startAutoRefresh().catch(() => {});
    void supabase.auth.refreshSession().catch(() => {});
    applySharedWatch(false);
  }, [applySharedWatch]);

  useEffect(() => {
    if (loading) return;

    const prevUser = watchUserRef.current;

    if (prevUser && userId && prevUser !== userId) {
      clearIdleCountdown();
      clearIdleForceLogout();
    }

    if (!userId) {
      clearClockTimers();
      setWarningOpen(false);
      warningOpenRef.current = false;
      if (prevUser) {
        clearIdleCountdown();
      }
      watchUserRef.current = null;
      return;
    }

    watchUserRef.current = userId;

    if (readRememberSession()) {
      clearClockTimers();
      clearIdleCountdown();
      clearIdleForceLogout();
      setWarningOpen(false);
      warningOpenRef.current = false;
      void supabase.auth.startAutoRefresh().catch(() => {});
      return;
    }

    applySharedWatch(true);

    const onActivity = () => bumpActivity();
    const onResume = () => applySharedWatchRef.current(false);
    const onStorage = (event: StorageEvent) => {
      if (!isIdleStorageKey(event.key)) return;
      applySharedWatchRef.current(false);
    };

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true, capture: true });
    }
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('storage', onStorage);

    return () => {
      clearClockTimers();
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity, true);
      }
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('storage', onStorage);
    };
  }, [loading, userId, applySharedWatch, bumpActivity, clearClockTimers]);

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
