/**
 * Bandeau visiteur : le front ne lit que `founder_offer_closed`.
 * `founders_remaining` ne s’affiche que dans le bandeau membre
 * (`FounderInviteBanner`), et seulement si `get_founder_slot_status`
 * renvoie un entier. Aucun autre écran ne doit l’inventer ni l’afficher.
 */
export function parseFounderOfferClosed(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  return (raw as Record<string, unknown>).founder_offer_closed === true;
}
