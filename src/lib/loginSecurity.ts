import { supabase } from '@/lib/supabase';

/** Seuil serveur (record_login_failure) — ne pas utiliser pour un verrouillage local. */
export const LOGIN_FAILURE_LIMIT = 4;

/** Affiché uniquement après un notify_lock réussi (e-mail « Déblocage de votre compte Aypik »). */
export const ACCOUNT_LOCKED_MESSAGE =
  "Pour des raisons de sécurité, ce compte est bloqué après plusieurs tentatives. Un e-mail vient de t'être envoyé pour réinitialiser ton mot de passe et débloquer ton compte.";

/** Compte verrouillé côté serveur, sans nouvel e-mail de déblocage dans cette session. */
export const ACCOUNT_LOCKED_CHECK_MAIL_MESSAGE =
  "Pour des raisons de sécurité, ce compte est bloqué. Consulte ta boîte mail pour le lien de déblocage, ou utilise « Mot de passe oublié » si tu ne l'as pas reçu.";

export const RESET_EMAIL_SENT_MESSAGE =
  "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé.";

const PRODUCTION_RECOVERY_URL = 'https://aypik.fr/?reset=1';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeResetEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function isValidResetEmail(email: string | null | undefined): boolean {
  return EMAIL_RE.test(normalizeResetEmail(email));
}

export function recoveryRedirectUrl(): string {
  if (typeof window === 'undefined') return PRODUCTION_RECOVERY_URL;
  try {
    const origin = window.location.origin.replace(/\/$/, '');
    const host = window.location.hostname;
    const allowedHost =
      host === 'aypik.fr' ||
      host === 'www.aypik.fr' ||
      host === 'localhost' ||
      host === '127.0.0.1';
    if (!allowedHost) return PRODUCTION_RECOVERY_URL;
    const url = new URL(origin);
    url.searchParams.set('reset', '1');
    return url.toString();
  } catch {
    return PRODUCTION_RECOVERY_URL;
  }
}

type RecoveryToken = {
  tokenHash: string;
  type: 'recovery' | 'magiclink';
};

function paramsFromLocation(): URLSearchParams {
  const query = new URLSearchParams(window.location.search);
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return query;
  const fromHash = new URLSearchParams(hash);
  fromHash.forEach((value, key) => {
    if (!query.has(key)) query.set(key, value);
  });
  return query;
}

export function getRecoveryTokenFromUrl(): RecoveryToken | null {
  if (typeof window === 'undefined') return null;
  const params = paramsFromLocation();
  const tokenHash = params.get('token_hash') || params.get('token');
  if (!tokenHash) return null;
  const rawType = (params.get('type') || 'recovery').toLowerCase();
  const type = rawType === 'magiclink' ? 'magiclink' : 'recovery';
  return { tokenHash, type };
}

/** Jeton lu une fois, pour le remount Strict Mode après replaceState. */
let cachedRecoveryToken: RecoveryToken | null = null;

const AUTH_SECRET_KEYS = [
  'token_hash',
  'token',
  'code',
  'access_token',
  'refresh_token',
  'expires_in',
  'expires_at',
  'token_type',
  'provider_token',
  'provider_refresh_token',
] as const;

const AUTH_FLAG_KEYS = ['reset', 'type'] as const;

function stripAuthKeysFromUrl(keys: readonly string[]): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const key of keys) {
    url.searchParams.delete(key);
  }
  if (url.hash) {
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    for (const key of keys) {
      hash.delete(key);
    }
    const nextHash = hash.toString();
    url.hash = nextHash ? nextHash : '';
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (
    next !==
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  ) {
    window.history.replaceState({}, '', next);
  }
}

/** Retire le jeton (query + hash) dès qu’il a été lu, sans attendre verifyOtp. */
export function consumeRecoverySecretsFromUrl(): void {
  stripAuthKeysFromUrl(AUTH_SECRET_KEYS);
}

/** Retire tokens / flags d’auth de l’URL (query + hash) après consommation. */
export function consumeRecoveryParamsFromUrl(): void {
  stripAuthKeysFromUrl([...AUTH_SECRET_KEYS, ...AUTH_FLAG_KEYS]);
}

/**
 * Lit le jeton de recovery, le mémorise, puis le retire de l’URL tout de suite
 * (même principe que ?unsubscribed=). `reset` / `type` restent jusqu’à
 * consumeRecoveryParamsFromUrl pour garder l’écran « Nouveau mot de passe ».
 */
export function takeRecoveryTokenFromUrl(): RecoveryToken | null {
  const token = getRecoveryTokenFromUrl();
  if (token) cachedRecoveryToken = token;
  consumeRecoverySecretsFromUrl();
  return token ?? cachedRecoveryToken;
}

export function clearCachedRecoveryToken(): void {
  cachedRecoveryToken = null;
}

export function isPasswordRecoveryRedirect(): boolean {
  if (typeof window === 'undefined') return false;
  if (cachedRecoveryToken || getRecoveryTokenFromUrl()) return true;
  const params = paramsFromLocation();
  if (params.get('reset') === '1' || params.get('type') === 'recovery') {
    return true;
  }
  return false;
}

type RpcFlagRow = {
  ok?: boolean;
  locked?: boolean;
  just_locked?: boolean;
  attempts?: number;
  error?: string;
};

function asRpcFlags(data: unknown): RpcFlagRow {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as RpcFlagRow;
    } catch {
      return {};
    }
  }
  if (data && typeof data === 'object') return data as RpcFlagRow;
  return {};
}

async function rpcFlags(
  fn: string,
  args: Record<string, unknown> = {}
): Promise<RpcFlagRow> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return asRpcFlags(data);
}

export async function fetchLoginLockStatus(email: string): Promise<boolean> {
  try {
    const row = await rpcFlags('login_security_status', { p_email: email.trim() });
    return row.locked === true;
  } catch {
    return false;
  }
}

/**
 * NOTE SÉCURITÉ (2026-08-24) : record_login_failure est appelable avec la clé
 * anon sans qu'un vrai échec de connexion ait eu lieu (personne ne revérifie
 * le mot de passe côté serveur). Anti-spam actuel : 1 échec compté max toutes
 * les 30s par compte (migration harden_record_login_failure_throttle) — ça
 * rend un verrouillage instantané impraticable, sans éliminer la possibilité
 * théorique pour un attaquant patient.
 *
 * Option 1 en réserve si besoin de fermer complètement la faille (décision
 * utilisateur, reportée volontairement) : faire transiter toute la tentative
 * de connexion par l'Edge Function `login-security` (seule à appeler
 * signInWithPassword, captcha consommé une fois), qui déciderait alors seule
 * si un échec est réel avant d'appeler cette fonction en service_role.
 * Alternative payante : plan Supabase Team (599 $/mois) pour le hook natif
 * "Password Verification Attempt" (indisponible sur Free/Pro).
 * Reporté pour ne pas risquer de régression sur le parcours de connexion
 * tout juste stabilisé (bug Navigator LockManager + CAPTCHA Turnstile).
 * Même note laissée en commentaire sur la fonction côté base (COMMENT ON
 * FUNCTION record_login_failure).
 */
export async function recordLoginFailure(email: string): Promise<{
  locked: boolean;
  justLocked: boolean;
  attempts: number;
}> {
  try {
    const row = await rpcFlags('record_login_failure', { p_email: email.trim() });
    return {
      locked: row.locked === true,
      justLocked: row.just_locked === true,
      attempts: typeof row.attempts === 'number' ? row.attempts : 0,
    };
  } catch {
    return { locked: false, justLocked: false, attempts: 0 };
  }
}

export async function clearLoginFailuresIfAllowed(): Promise<boolean> {
  try {
    const row = await rpcFlags('clear_login_failures');
    return row.locked === true;
  } catch {
    return false;
  }
}

export async function unlockLoginSecurity(): Promise<void> {
  const row = await rpcFlags('unlock_login_security');
  if (row.ok === false) {
    throw new Error(row.error || 'unlock_failed');
  }
}

export async function fetchOwnLoginLocked(): Promise<boolean> {
  try {
    const row = await rpcFlags('login_security_is_locked');
    return row.locked === true;
  } catch {
    return false;
  }
}

async function functionErrorDetail(
  error: unknown,
  payload: Record<string, unknown>
): Promise<string | null> {
  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }
  const ctx =
    error && typeof error === 'object' && 'context' in error
      ? (error as { context?: Response }).context
      : undefined;
  if (ctx && typeof ctx.clone === 'function') {
    try {
      const body = (await ctx.clone().json()) as { error?: unknown };
      if (typeof body?.error === 'string' && body.error.trim()) {
        return body.error;
      }
    } catch {
      /* corps non JSON */
    }
  }
  return error instanceof Error ? error.message : null;
}

async function sendResetViaResend(email: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('login-security', {
    body: {
      action: 'reset_password',
      email,
    },
  });

  const payload =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};

  if (payload.ok === true || payload.emailed === true || payload.skipped === true) {
    return true;
  }

  const detail = await functionErrorDetail(error, payload);
  if (import.meta.env.DEV) {
    console.error(error ?? new Error(detail || 'login-security reset failed'), {
      via: 'login-security',
      detail,
    });
  }
  return false;
}

export async function sendPasswordResetEmail(
  email: string,
  captchaToken?: string
): Promise<void> {
  const trimmed = normalizeResetEmail(email);
  const redirectTo = recoveryRedirectUrl();

  if (!isValidResetEmail(trimmed)) {
    throw new Error('Adresse e-mail invalide');
  }

  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo,
    captchaToken,
  });

  if (!error) return;

  if (import.meta.env.DEV) {
    console.error(error, {
      via: 'resetPasswordForEmail',
      code: error.code,
      status: error.status,
    });
  }

  const resent = await sendResetViaResend(trimmed);
  if (resent) return;

  throw new Error(
    "Impossible d'envoyer l'e-mail de réinitialisation pour le moment. Réessaie dans un instant."
  );
}

type AuthFnError = Error & { code?: string; status?: number };

async function parseFunctionPayload(
  error: unknown,
  data: unknown
): Promise<Record<string, unknown>> {
  const fromData =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  if (Object.keys(fromData).length > 0) return fromData;

  const ctx =
    error && typeof error === 'object' && 'context' in error
      ? (error as { context?: Response }).context
      : undefined;
  if (ctx && typeof ctx.clone === 'function') {
    try {
      const body = (await ctx.clone().json()) as unknown;
      if (body && typeof body === 'object') return body as Record<string, unknown>;
    } catch {
      /* corps non JSON */
    }
  }
  return fromData;
}

/**
 * Connexion via l’Edge Function (dummy bcrypt si l’e-mail n’existe pas).
 * Remplace signInWithPassword sur l’écran de login pour égaliser le timing.
 */
export async function signInWithPasswordSecure(
  email: string,
  password: string,
  captchaToken?: string
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('login-security', {
    body: {
      action: 'sign_in',
      email: email.trim(),
      password,
      captchaToken,
    },
  });

  const payload = await parseFunctionPayload(error, data);

  if (
    payload.ok === true &&
    typeof payload.access_token === 'string' &&
    typeof payload.refresh_token === 'string'
  ) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    });
    if (sessionError) throw sessionError;
    return;
  }

  const code =
    typeof payload.code === 'string' && payload.code.trim()
      ? payload.code.trim()
      : '';
  const message =
    (typeof payload.message === 'string' && payload.message.trim()) ||
    (typeof payload.error === 'string' && payload.error.trim()) ||
    '';

  if (
    code === 'invalid_credentials' ||
    code === 'invalid_grant' ||
    code === 'invalid_login_credentials' ||
    /invalid login credentials/i.test(message)
  ) {
    const err: AuthFnError = new Error('Invalid login credentials');
    err.code = 'invalid_credentials';
    err.status = 400;
    throw err;
  }

  if (code) {
    const err: AuthFnError = new Error(message || code);
    err.code = code;
    throw err;
  }

  if (message) {
    throw new Error(message);
  }

  throw new Error(
    'Impossible de se connecter pour le moment. Réessaie dans un instant.'
  );
}

/** E-mail d’alerte + lien de déblocage. true si l’Edge Function a envoyé. */
export async function notifyAccountLocked(email: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('login-security', {
      body: { action: 'notify_lock', email: email.trim() },
    });
    if (error) return false;
    const payload =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    return payload.emailed === true || payload.alreadySent === true;
  } catch {
    return false;
  }
}
