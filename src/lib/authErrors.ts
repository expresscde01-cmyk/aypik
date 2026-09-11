import { isAuthWeakPasswordError } from '@supabase/supabase-js';
import { t } from '../i18n/t.ts';

export function emailAlreadyRegisteredMessage(): string {
  return t('errors.emailAlreadyRegistered');
}

export function emailOrPasswordIncorrectMessage(): string {
  return t('errors.emailOrPasswordIncorrect');
}

const CODE_KEYS: Record<string, string> = {
  weak_password: 'errors.weakPassword',
  email_exists: 'errors.emailAlreadyRegistered',
  user_already_exists: 'errors.emailAlreadyRegistered',
  already_registered: 'errors.emailAlreadyRegistered',
  invalid_credentials: 'errors.emailOrPasswordIncorrect',
  captcha_failed: 'errors.captchaInvalid',
  email_not_confirmed: 'errors.emailNotConfirmed',
  email_address_invalid: 'errors.emailInvalid',
  signup_disabled: 'errors.signupDisabled',
  over_request_rate_limit: 'errors.rateLimit',
  over_email_send_rate_limit: 'errors.emailRateLimit',
  account_locked: 'auth.accountLockedCheckMail',
  validation_failed: 'errors.generic',
  same_password: 'errors.samePassword',
  phone_exists: 'errors.phoneExists',
  sms_send_failed: 'errors.smsSendFailed',
  over_sms_send_rate_limit: 'errors.smsRateLimit',
  phone_country_not_allowed: 'errors.phoneCountry',
  unauthorized: 'errors.unauthorized',
};

const MESSAGE_PATTERNS: [RegExp, () => string][] = [
  [
    /password.*at least/i,
    () => t('errors.passwordMinLength', { count: 12 }),
  ],
  [/already registered/i, () => t('errors.emailAlreadyRegistered')],
  [/user_already_exists/i, () => t('errors.emailAlreadyRegistered')],
  [/email_exists/i, () => t('errors.emailAlreadyRegistered')],
  [/users_normalized_email/i, () => t('errors.emailAlreadyRegistered')],
  [/invalid login credentials/i, () => t('errors.emailOrPasswordIncorrect')],
  [/captcha protection/i, () => t('errors.captchaInvalid')],
  [/captcha_failed/i, () => t('errors.captchaInvalid')],
  [/email.*confirm/i, () => t('errors.emailNotConfirmed')],
  [/unable to validate email/i, () => t('errors.emailInvalid')],
  [/signup requires a valid password/i, () => t('auth.needPassword')],
  [/password is known to be weak/i, () => t('errors.passwordCommon')],
  [
    /new password should be different from the old password/i,
    () => t('errors.samePassword'),
  ],
  [/same_password/i, () => t('errors.samePassword')],
  [
    /error sending recovery email/i,
    () => t('errors.smsSendFailed'),
  ],
  [
    /failed to send a request to the edge function/i,
    () => t('errors.smsSendFailed'),
  ],
  [
    /edge function returned a non-2xx/i,
    () => t('errors.smsSendFailed'),
  ],
  [/token has expired or is invalid/i, () => t('errors.otpInvalid')],
  [/invalid.*otp/i, () => t('errors.otpInvalid')],
  [/invalid phone number/i, () => t('errors.phoneInvalid')],
  [/phone_number_invalid/i, () => t('errors.phoneInvalid')],
  [/phone_country_not_allowed/i, () => t('errors.phoneCountry')],
  [/phone_provider_disabled/i, () => t('errors.phoneDisabled')],
];

function weakPasswordReason(reason: string): string {
  if (reason === 'length') return t('errors.passwordMinLength', { count: 12 });
  if (reason === 'characters') {
    return `${t('errors.passwordUppercase')} ${t('errors.passwordSpecial')}`;
  }
  if (reason === 'pwned') return t('errors.passwordPwned');
  return t('errors.weakPassword');
}

function authErrorBlob(err: unknown): { code: string; text: string } {
  const o = err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const code = o.code != null ? String(o.code) : '';
  const message = err instanceof Error ? err.message : String(err ?? '');
  const hint = o.hint != null ? String(o.hint) : '';
  const details = o.details != null ? String(o.details) : '';
  return { code, text: `${code} ${message} ${hint} ${details}` };
}

export function isEmailAlreadyRegisteredError(err: unknown): boolean {
  const { code, text } = authErrorBlob(err);
  if (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    code === 'already_registered'
  ) {
    return true;
  }
  if (code === '23505') {
    return /email/i.test(text);
  }
  return (
    /already registered/i.test(text) ||
    /user_already_exists/i.test(text) ||
    /email_exists/i.test(text) ||
    /users_normalized_email/i.test(text)
  );
}

export function isObfuscatedDuplicateSignup(user: {
  identities?: unknown[] | null;
} | null | undefined): boolean {
  return Array.isArray(user?.identities) && user.identities.length === 0;
}

export function translateAuthError(err: unknown): string {
  if (isAuthWeakPasswordError(err)) {
    if (err.reasons.length > 0) {
      return err.reasons.map((reason) => weakPasswordReason(reason)).join(' ');
    }
    return t('errors.weakPassword');
  }

  if (isEmailAlreadyRegisteredError(err)) {
    return t('errors.emailAlreadyRegistered');
  }

  const message =
    err instanceof Error ? err.message : t('common.errorOccurred');
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code)
      : undefined;

  if (code && CODE_KEYS[code]) {
    return t(CODE_KEYS[code]);
  }

  for (const [pattern, messageFn] of MESSAGE_PATTERNS) {
    if (pattern.test(message)) return messageFn();
  }

  return message;
}

export function isInvalidLoginCredentials(err: unknown): boolean {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code)
      : '';
  if (
    code === 'invalid_credentials' ||
    code === 'invalid_grant' ||
    code === 'invalid_login_credentials'
  ) {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err ?? '');
  return (
    /invalid login credentials/i.test(message) ||
    /invalid_credentials/i.test(message) ||
    /email or password/i.test(message) ||
    /email ou mot de passe incorrect/i.test(message) ||
    /mot de passe incorrect/i.test(message)
  );
}

/** Échec de connexion à compter (pas un souci réseau / confirmation e-mail). */
export function shouldCountLoginFailure(err: unknown): boolean {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code)
      : '';
  if (
    code === 'email_not_confirmed' ||
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    code === 'captcha_failed'
  ) {
    return false;
  }
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (/failed to fetch|networkerror|load failed/i.test(message)) return false;
  if (/captcha protection|captcha_failed/i.test(message)) return false;
  if (err instanceof Error && err.name === 'LoginClientTimeoutError') return false;
  return isInvalidLoginCredentials(err) || code !== '';
}
