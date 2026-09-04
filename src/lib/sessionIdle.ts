/**
 * Déconnexion pour inactivité (sessions « ordinaires »).
 * « Rester connecté » (login) exempte le timeout de 30 min.
 *
 * Filet serveur : stopAutoRefresh() dès l’avertissement → le JWT
 * n’est plus renouvelé et expire côté GoTrue même si le JS est contourné.
 */

export const IDLE_AUTH_NOTICE_KEY = 'aypik:auth-notice';
export const REMEMBER_SESSION_KEY = 'aypik:remember-session';

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
