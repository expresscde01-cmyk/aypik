/** Fenêtre du lien de récupération (OTP Auth, 1 h par défaut). */
export const RECOVERY_LINK_WINDOW_MS = 60 * 60 * 1000;

/**
 * Jeton émis alors que locked_at est rempli.
 * "recovery" : valeur documentée (échange de code PKCE).
 * "otp" : ce que POST /verify type=recovery envoie vraiment, seulement si le
 * jeton de récupération vient d'être consommé. password, token_refresh et le
 * reste restent refusés.
 */
export function lockedAccountMayIssueToken(input: {
  authenticationMethod: string | null | undefined;
  recoverySentAt: string | null;
  recoveryTokenEmpty: boolean;
  now?: number;
}): boolean {
  const method = input.authenticationMethod ?? '';
  if (method === 'recovery') return true;
  if (method !== 'otp') return false;
  if (!input.recoveryTokenEmpty || !input.recoverySentAt) return false;
  const sent = Date.parse(input.recoverySentAt);
  if (Number.isNaN(sent)) return false;
  const now = input.now ?? Date.now();
  return sent <= now && now - sent <= RECOVERY_LINK_WINDOW_MS;
}
