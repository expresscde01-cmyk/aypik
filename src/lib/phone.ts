/**
 * Normalisation / validation minimale des numéros de téléphone pour la
 * vérification par SMS. On ne vise que la France pour l'instant (comme le
 * reste du site), avec tolérance sur les formats de saisie courants :
 * "06 52 28 94 11", "0652289411", "+33652289411", "0033652289411".
 */

/** Retire tout ce qui n'est pas un chiffre ou un "+" initial. */
function stripFormatting(raw: string): string {
  const trimmed = raw.trim();
  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  return hasLeadingPlus ? `+${digits}` : digits;
}

/**
 * Convertit une saisie utilisateur en E.164 (+33...) si possible.
 * Retourne null si le numéro ne ressemble pas à un mobile/fixe français valide.
 */
export function toE164France(raw: string): string | null {
  const cleaned = stripFormatting(raw);

  let national: string | null = null;

  if (cleaned.startsWith('+33')) {
    const rest = cleaned.slice(3);
    if (/^[1-9]\d{8}$/.test(rest)) national = rest;
  } else if (cleaned.startsWith('0033')) {
    const rest = cleaned.slice(4);
    if (/^[1-9]\d{8}$/.test(rest)) national = rest;
  } else if (cleaned.startsWith('0') && /^0[1-9]\d{8}$/.test(cleaned)) {
    national = cleaned.slice(1);
  } else if (/^[1-9]\d{8}$/.test(cleaned)) {
    // déjà sans le 0 initial
    national = cleaned;
  }

  if (!national) return null;
  return `+33${national}`;
}

/** Format d'affichage lisible à partir d'un E.164 français : "+33 6 52 28 94 11". */
export function formatE164ForDisplay(e164: string): string {
  const match = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  if (!match) return e164;
  const [, first, ...rest] = match;
  return `+33 ${first} ${rest.join(' ')}`;
}

/**
 * Date de mise en ligne de la vérification téléphone obligatoire.
 * Les comptes créés AVANT cette date ne sont pas bloqués rétroactivement
 * (ils n'ont jamais eu l'occasion de vérifier un numéro à l'inscription) ;
 * seuls les comptes créés à partir de cette date doivent vérifier leur
 * numéro avant d'accéder au site. Voir AppShell.tsx.
 */
export const PHONE_VERIFICATION_REQUIRED_SINCE = '2026-08-25T12:35:00Z';

export const PHONE_OTP_LENGTH = 6;

export function isValidOtpCode(code: string): boolean {
  return new RegExp(`^\\d{${PHONE_OTP_LENGTH}}$`).test(code.trim());
}
