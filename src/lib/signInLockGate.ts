/**
 * Règle sign_in : des tokens seulement si GoTrue a une session
 * et que public.login_security.locked_at est clairement absent.
 * locked === true ou statut illisible → pas de tokens
 * (même réponse que mot de passe invalide, côté Edge Function).
 */
export function allowSignInTokens(input: {
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  locked: boolean | null;
}): boolean {
  if (!input.hasAccessToken || !input.hasRefreshToken) return false;
  return input.locked === false;
}

export function lockedFlagFromStatus(data: unknown): boolean | null {
  let row = data;
  if (typeof row === 'string') {
    try {
      row = JSON.parse(row) as unknown;
    } catch {
      return null;
    }
  }
  if (!row || typeof row !== 'object') return null;
  if (!('locked' in row)) return null;
  return (row as { locked: unknown }).locked === true;
}
