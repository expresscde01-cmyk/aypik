import { isAuthWeakPasswordError } from '@supabase/supabase-js';

export const EMAIL_ALREADY_REGISTERED_MESSAGE =
  'Un compte existe déjà avec cette adresse e-mail. Connecte-toi plutôt.';

export const EMAIL_OR_PASSWORD_INCORRECT_MESSAGE =
  'Email ou mot de passe incorrect.';

const CODE_MESSAGES: Record<string, string> = {
  weak_password: 'Le mot de passe est trop faible.',
  email_exists: EMAIL_ALREADY_REGISTERED_MESSAGE,
  user_already_exists: EMAIL_ALREADY_REGISTERED_MESSAGE,
  already_registered: EMAIL_ALREADY_REGISTERED_MESSAGE,
  invalid_credentials: EMAIL_OR_PASSWORD_INCORRECT_MESSAGE,
  captcha_failed: 'CAPTCHA invalide ou expiré. Réessaie.',
  email_not_confirmed:
    'Confirme ton adresse e-mail avant de te connecter.',
  email_address_invalid: 'Adresse e-mail invalide.',
  signup_disabled: "L'inscription est actuellement désactivée.",
  over_request_rate_limit: 'Trop de tentatives. Réessaie plus tard.',
  over_email_send_rate_limit:
    "Trop d'e-mails envoyés. Réessaie plus tard.",
  account_locked:
    "Pour des raisons de sécurité, ce compte est bloqué. Consulte ta boîte mail pour le lien de déblocage, ou utilise « Mot de passe oublié » si tu ne l'as pas reçu.",
  validation_failed: 'Les informations saisies sont invalides.',
  same_password: 'Le nouveau mot de passe doit être différent de l\'ancien.',
  phone_exists: 'Ce numéro de téléphone est déjà utilisé par un autre compte.',
  sms_send_failed:
    "Impossible d'envoyer le SMS pour le moment. Réessaie dans un instant.",
  over_sms_send_rate_limit: 'Trop de SMS envoyés. Réessaie dans quelques minutes.',
};

const MESSAGE_PATTERNS: [RegExp, string][] = [
  [/password.*at least/i, 'Le mot de passe doit contenir au moins 12 caractères.'],
  [/already registered/i, EMAIL_ALREADY_REGISTERED_MESSAGE],
  [/user_already_exists/i, EMAIL_ALREADY_REGISTERED_MESSAGE],
  [/email_exists/i, EMAIL_ALREADY_REGISTERED_MESSAGE],
  [/users_normalized_email/i, EMAIL_ALREADY_REGISTERED_MESSAGE],
  [/invalid login credentials/i, EMAIL_OR_PASSWORD_INCORRECT_MESSAGE],
  [/captcha protection/i, 'CAPTCHA invalide ou expiré. Réessaie.'],
  [/captcha_failed/i, 'CAPTCHA invalide ou expiré. Réessaie.'],
  [/email.*confirm/i, 'Confirme ton adresse e-mail.'],
  [/unable to validate email/i, 'Adresse e-mail invalide.'],
  [/signup requires a valid password/i, 'Saisis un mot de passe valide.'],
  [/password is known to be weak/i, 'Ce mot de passe est trop courant. Choisis-en un autre.'],
  [
    /new password should be different from the old password/i,
    'Le nouveau mot de passe doit être différent de l\'ancien.',
  ],
  [/same_password/i, 'Le nouveau mot de passe doit être différent de l\'ancien.'],
  [/error sending recovery email/i, "Impossible d'envoyer l'e-mail de réinitialisation pour le moment. Réessaie dans un instant."],
  [/failed to send a request to the edge function/i, "Impossible d'envoyer l'e-mail pour le moment. Réessaie dans un instant."],
  [/edge function/i, "Impossible d'envoyer l'e-mail pour le moment. Réessaie dans un instant."],
  [/token has expired or is invalid/i, 'Code invalide ou expiré. Demande un nouveau code.'],
  [/invalid.*otp/i, 'Code invalide ou expiré. Demande un nouveau code.'],
  [/invalid phone number/i, 'Numéro de téléphone invalide.'],
  [/phone_number_invalid/i, 'Numéro de téléphone invalide.'],
  [/phone_provider_disabled/i, "La vérification par téléphone n'est pas disponible pour le moment."],
];

const WEAK_PASSWORD_REASONS: Record<string, string> = {
  length: 'Le mot de passe doit contenir au moins 12 caractères.',
  characters:
    'Le mot de passe doit contenir au moins une majuscule et un caractère spécial.',
  pwned: 'Ce mot de passe a été compromis dans une fuite de données. Choisis-en un autre.',
};

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
      return err.reasons
        .map((reason) => WEAK_PASSWORD_REASONS[reason] ?? 'Le mot de passe est trop faible.')
        .join(' ');
    }
    return 'Le mot de passe est trop faible.';
  }

  if (isEmailAlreadyRegisteredError(err)) {
    return EMAIL_ALREADY_REGISTERED_MESSAGE;
  }

  const message =
    err instanceof Error ? err.message : 'Une erreur est survenue';
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code)
      : undefined;

  if (code && CODE_MESSAGES[code]) {
    return CODE_MESSAGES[code];
  }

  for (const [pattern, french] of MESSAGE_PATTERNS) {
    if (pattern.test(message)) return french;
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
  return isInvalidLoginCredentials(err) || code !== '';
}
