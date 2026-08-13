import { isAuthWeakPasswordError } from '@supabase/supabase-js';

const CODE_MESSAGES: Record<string, string> = {
  weak_password: 'Le mot de passe est trop faible.',
  email_exists: 'Cette adresse e-mail est déjà utilisée.',
  user_already_exists: 'Cette adresse e-mail est déjà utilisée.',
  invalid_credentials: 'E-mail ou mot de passe incorrect.',
  email_not_confirmed:
    'Confirme ton adresse e-mail avant de te connecter.',
  email_address_invalid: 'Adresse e-mail invalide.',
  signup_disabled: "L'inscription est actuellement désactivée.",
  over_request_rate_limit: 'Trop de tentatives. Réessaie plus tard.',
  over_email_send_rate_limit:
    "Trop d'e-mails envoyés. Réessaie plus tard.",
  validation_failed: 'Les informations saisies sont invalides.',
};

const MESSAGE_PATTERNS: [RegExp, string][] = [
  [/password.*at least/i, 'Le mot de passe doit contenir au moins 12 caractères.'],
  [/already registered/i, 'Cette adresse e-mail est déjà utilisée.'],
  [/invalid login credentials/i, 'E-mail ou mot de passe incorrect.'],
  [/email.*confirm/i, 'Confirme ton adresse e-mail.'],
  [/unable to validate email/i, 'Adresse e-mail invalide.'],
  [/signup requires a valid password/i, 'Saisis un mot de passe valide.'],
  [/password is known to be weak/i, 'Ce mot de passe est trop courant. Choisis-en un autre.'],
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
