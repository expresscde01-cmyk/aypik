import { t } from '../i18n/t.ts';

const MIN_LENGTH = 12;
const HAS_UPPERCASE = /[A-Z]/;
const HAS_SPECIAL = /[^A-Za-z0-9]/;

export function validateSignupPassword(password: string): string | null {
  if (password.length < MIN_LENGTH) {
    return t('errors.passwordMinLength', { count: MIN_LENGTH });
  }

  if (!HAS_UPPERCASE.test(password)) {
    return t('errors.passwordUppercase');
  }

  if (!HAS_SPECIAL.test(password)) {
    return t('errors.passwordSpecial');
  }

  return null;
}
