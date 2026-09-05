/**
 * Déconnexion pour inactivité (sessions « ordinaires »).
 * « Rester connecté » (login) exempte le timeout de 30 min.
 *
 * Multi-onglets : `lastActiveAt` + `logoutAt` en localStorage (`aypik:idle-watch`).
 * Premier onglet : crée la paire si absente. Onglets suivants : lecture seule
 * jusqu’à une activité réelle ou « Rester connecté ».
 *
 * Filet serveur : stopAutoRefresh() dès l’avertissement → le JWT
 * n’est plus renouvelé et expire côté GoTrue même si le JS est contourné.
 */

export const IDLE_AUTH_NOTICE_KEY = 'aypik:auth-notice';
export const REMEMBER_SESSION_KEY = 'aypik:remember-session';
/** État partagé multi-onglets (localStorage) : lastActiveAt + logoutAt. */
export const IDLE_WATCH_KEY = 'aypik:idle-watch';
export const IDLE_FORCE_LOGOUT_KEY = 'aypik:idle-force-logout';
/** Anciennes clés sessionStorage — nettoyées à la lecture. */
export const IDLE_LOGOUT_AT_KEY = 'aypik:idle-logout-at';
export const IDLE_LAST_ACTIVE_KEY = 'aypik:idle-last-active';

/**
 * true uniquement pour un test local (ex. 30 s). Remettre à false avant prod.
 */
export const IDLE_DEBUG_SHORT = false;

const MINUTE = 60_000;

export const IDLE_TIMEOUT_MS = IDLE_DEBUG_SHORT ? 30_000 : 30 * MINUTE;
/** Avertissement : 2 min avant l’expiration (ou 10 s en mode debug court). */
export const IDLE_WARN_BEFORE_MS = IDLE_DEBUG_SHORT ? 10_000 : 2 * MINUTE;

export const IDLE_SIGNED_OUT_MESSAGE =
  'Vous avez été déconnecté pour inactivité.';

export type AuthNoticeKind = 'idle';

export function readRememberSession(): boolean {
  try {
    return localStorage.getItem(REMEMBER_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeRememberSession(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_SESSION_KEY, remember ? '1' : '0');
  } catch {
    /* private mode */
  }
}

export function setAuthNotice(kind: AuthNoticeKind): void {
  try {
    sessionStorage.setItem(IDLE_AUTH_NOTICE_KEY, kind);
  } catch {
    /* ignore */
  }
}

export function peekAuthNotice(): AuthNoticeKind | null {
  try {
    const raw = sessionStorage.getItem(IDLE_AUTH_NOTICE_KEY);
    if (raw === 'idle') return 'idle';
  } catch {
    /* ignore */
  }
  return null;
}

export function consumeAuthNotice(): AuthNoticeKind | null {
  try {
    const raw = sessionStorage.getItem(IDLE_AUTH_NOTICE_KEY);
    sessionStorage.removeItem(IDLE_AUTH_NOTICE_KEY);
    if (raw === 'idle') return 'idle';
  } catch {
    /* ignore */
  }
  return null;
}

export function authNoticeMessage(kind: AuthNoticeKind | null): string | null {
  if (kind === 'idle') return IDLE_SIGNED_OUT_MESSAGE;
  return null;
}

export type IdleWatchState = {
  lastActiveAt: number;
  logoutAt: number;
};

/** Filet mémoire si localStorage est indisponible (pas de sync multi-onglets). */
let memoryWatch: IdleWatchState | null = null;

function parseIdleWatch(raw: string): IdleWatchState | null {
  try {
    const v = JSON.parse(raw) as Partial<IdleWatchState>;
    if (
      typeof v.lastActiveAt === 'number' &&
      Number.isFinite(v.lastActiveAt) &&
      typeof v.logoutAt === 'number' &&
      Number.isFinite(v.logoutAt)
    ) {
      return { lastActiveAt: v.lastActiveAt, logoutAt: v.logoutAt };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function purgeLegacySessionIdleKeys(): void {
  try {
    sessionStorage.removeItem(IDLE_LOGOUT_AT_KEY);
    sessionStorage.removeItem(IDLE_LAST_ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

function writeIdleWatch(state: IdleWatchState): void {
  memoryWatch = state;
  try {
    localStorage.setItem(IDLE_WATCH_KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
  clearIdleForceLogout();
}

export function readIdleWatch(): IdleWatchState | null {
  purgeLegacySessionIdleKeys();
  try {
    const raw = localStorage.getItem(IDLE_WATCH_KEY);
    if (raw == null || raw === '') {
      memoryWatch = null;
      return null;
    }
    const parsed = parseIdleWatch(raw);
    memoryWatch = parsed;
    return parsed;
  } catch {
    return memoryWatch;
  }
}

export function readIdleLogoutAt(): number | null {
  return readIdleWatch()?.logoutAt ?? null;
}

export function readIdleLastActiveAt(): number | null {
  return readIdleWatch()?.lastActiveAt ?? null;
}

export function isIdleWarningDue(logoutAt: number, now = Date.now()): boolean {
  return now >= logoutAt - IDLE_WARN_BEFORE_MS;
}

export function remainingIdleSeconds(logoutAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((logoutAt - now) / 1000));
}

export function isIdleStorageKey(key: string | null): boolean {
  return (
    key === IDLE_WATCH_KEY ||
    key === IDLE_FORCE_LOGOUT_KEY ||
    key === null
  );
}

/**
 * Premier onglet uniquement : crée lastActive + logoutAt s’ils n’existent pas.
 * Un onglet ouvert ensuite adopte cette valeur et n’écrit rien.
 */
export function initIdleWatchIfAbsent(now = Date.now()): IdleWatchState {
  const existing = readIdleWatch();
  if (existing) return existing;
  const state: IdleWatchState = {
    lastActiveAt: now,
    logoutAt: now + IDLE_TIMEOUT_MS,
  };
  try {
    if (localStorage.getItem(IDLE_WATCH_KEY)) {
      return readIdleWatch() ?? state;
    }
  } catch {
    /* private mode */
  }
  writeIdleWatch(state);
  return state;
}

/** Activité réelle ou « Rester connecté » — seul moyen d’étendre logoutAt. */
export function writeIdleActivity(at: number): IdleWatchState {
  const state: IdleWatchState = {
    lastActiveAt: at,
    logoutAt: at + IDLE_TIMEOUT_MS,
  };
  writeIdleWatch(state);
  return state;
}

export function clearIdleCountdown(): void {
  memoryWatch = null;
  try {
    localStorage.removeItem(IDLE_WATCH_KEY);
  } catch {
    /* ignore */
  }
  purgeLegacySessionIdleKeys();
}

export function markIdleForceLogout(accessToken?: string | null): void {
  try {
    const stamp =
      accessToken && accessToken.length > 0 ? accessToken.slice(-24) : String(Date.now());
    localStorage.setItem(IDLE_FORCE_LOGOUT_KEY, stamp);
  } catch {
    /* ignore */
  }
}

export function clearIdleForceLogout(): void {
  try {
    localStorage.removeItem(IDLE_FORCE_LOGOUT_KEY);
  } catch {
    /* ignore */
  }
}

export function readIdleForceLogout(accessToken?: string | null): boolean {
  try {
    const raw = localStorage.getItem(IDLE_FORCE_LOGOUT_KEY);
    if (raw == null || raw === '') return false;
    if (!accessToken) return true;
    return raw === accessToken.slice(-24);
  } catch {
    return false;
  }
}
