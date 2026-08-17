import { isAuthWeakPasswordError } from '@supabase/supabase-js';

const CODE_MESSAGES: Record<string, string> = {
  weak_password: 'Le mot de passe est trop faible.',
  email_exists: 'Cette adresse e-mail est déjà utilisée.',
  user_already_exists: 'Cette adresse e-mail est déjà utilisée.',
  invalid_credentials: 'Mot de passe incorrect.',
  email_not_confirmed:
    'Confirme ton adresse e-mail avant de te connecter.',
  email_address_invalid: 'Adresse e-mail invalide.',
  signup_disabled: "L'inscription est actuellement désactivée.",
  over_request_rate_limit: 'Trop de tentatives. Réessaie plus tard.',
  over_email_send_rate_limit:
    "Trop d'e-mails envoyés. Réessaie plus tard.",
  account_locked:
    "Pour des raisons de sécurité, ce compte est bloqué après plusieurs tentatives. Un e-mail vient de t'être envoyé pour réinitialiser ton mot de passe et débloquer ton compte.",
  validation_failed: 'Les informations saisies sont invalides.',
  same_password: 'Le nouveau mot de passe doit être différent de l\'ancien.',
};

const MESSAGE_PATTERNS: [RegExp, string][] = [
  [/password.*at least/i, 'Le mot de passe doit contenir au moins 12 caractères.'],
  [/already registered/i, 'Cette adresse e-mail est déjà utilisée.'],
  [/invalid login credentials/i, 'Mot de passe incorrect.'],
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
];

const WEAK_PASSWORD_REASONS: Record<string, string> = {
  length: 'Le mot de passe doit contenir au moins 12 caractères.',
  characters:
    'Le mot de passe doit contenir au moins une majuscule et un caractère spécial.',
  pwned: 'Ce mot de passe a été compromis dans une fuite de données. Choisis-en un autre.',
};

export function translateAuthError(err: unknown): string {
  if (isAuthWeakPasswordError(err)) {
    if (err.reasons.length > 0) {
      return err.reasons
        .map((reason) => WEAK_PASSWORD_REASONS[reason] ?? 'Le mot de passe est trop faible.')
        .join(' ');
    }
    return 'Le mot de passe est trop faible.';
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
    code === 'over_email_send_rate_limit'
  ) {
    return false;
  }
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (/failed to fetch|networkerror|load failed/i.test(message)) return false;
  return isInvalidLoginCredentials(err) || code !== '';
}
