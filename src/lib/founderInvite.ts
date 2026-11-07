export const FOUNDER_INVITE_DISMISS_KEY = 'aypik:founder-invite-dismissed';
export const FOUNDER_INVITE_URL = 'https://aypik.fr';
/** À partir de ce nombre de places, et en dessous, le bandeau cite le compteur. */
export const FOUNDER_INVITE_SCARCE_MAX = 200;

export type FounderSlotSnapshot =
  | { known: false }
  | { known: true; remaining: number };

export type FounderInviteVariant = 'hidden' | 'open' | 'scarce';

export function isFounderInviteDismissed(): boolean {
  try {
    return localStorage.getItem(FOUNDER_INVITE_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissFounderInvite(): void {
  try {
    localStorage.setItem(FOUNDER_INVITE_DISMISS_KEY, '1');
  } catch {
    /* quota / mode privé */
  }
}

export function isDisplayedFounderNumber(
  value: number | null | undefined
): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Ne lit que `founders_remaining` tel que renvoyé par get_founder_slot_status.
 * Une valeur absente, non entière ou négative n’est pas convertie.
 * `founder_offer_closed` vrai masque le bandeau, sans inventer un reste.
 */
export function parseFounderSlotSnapshot(raw: unknown): FounderSlotSnapshot {
  if (!raw || typeof raw !== 'object') return { known: false };
  const row = raw as Record<string, unknown>;
  const remaining = row.founders_remaining;
  if (
    typeof remaining !== 'number' ||
    !Number.isInteger(remaining) ||
    remaining < 0
  ) {
    return { known: false };
  }
  if (row.founder_offer_closed === true) return { known: true, remaining: 0 };
  return { known: true, remaining };
}

export function founderInviteVariant(remaining: number): FounderInviteVariant {
  if (!Number.isInteger(remaining) || remaining <= 0) return 'hidden';
  if (remaining > FOUNDER_INVITE_SCARCE_MAX) return 'open';
  return 'scarce';
}
