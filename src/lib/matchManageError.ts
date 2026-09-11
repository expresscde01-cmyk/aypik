import { t } from '../i18n/t.ts';

/** Libellé d’envoi de message — hors sujet dans « Gestion du match ». */
export function chatNotMatchedMessage(): string {
  return t('errors.chatNotMatched');
}

/**
 * `manage_active_match` renvoie `not_matched` si le SQL ne voit pas le match.
 * Ne pas réutiliser le code brut : `includes('not_matched')` afficherait
 * le bandeau d’écriture dans la modale d’archive.
 */
export function matchManageRpcErrorCode(code: string): string {
  return code === 'not_matched' ? 'active_match_required' : code;
}

/** Jamais le bandeau « tu ne peux écrire… » dans Gestion du match. */
export function matchManageDisplayError(
  error: string | null | undefined
): string | null {
  const text = (error || '').trim();
  if (!text) return null;
  if (text === t('errors.chatNotMatched')) return null;
  return text;
}
