/**
 * Compteur public Fondateur : le front ne lit que `founder_offer_closed`.
 * `founders_remaining` / `founders_taken` / `founders_max` restent côté RPC
 * pour le diagnostic interne ; ils ne doivent jamais piloter ni s’afficher.
 */
export function parseFounderOfferClosed(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  return (raw as Record<string, unknown>).founder_offer_closed === true;
}
