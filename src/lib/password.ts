const MIN_LENGTH = 12;
const HAS_UPPERCASE = /[A-Z]/;
const HAS_SPECIAL = /[^A-Za-z0-9]/;

export function validateSignupPassword(password: string): string | null {
  if (password.length < MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_LENGTH} caractères.`;
  }

  if (!HAS_UPPERCASE.test(password)) {
    return 'Le mot de passe doit contenir au moins une majuscule.';
  }

  if (!HAS_SPECIAL.test(password)) {
    return 'Le mot de passe doit contenir au moins un caractère spécial.';
  }

  return null;
}
