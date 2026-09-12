export const HIGHLIGHT_OFFER_PARAM = 'highlightOffer';

export const HIGHLIGHT_OFFERS = [
  'simplifie',
  'detaille',
  'international',
  'premium',
  'visibility',
  'francophone',
] as const;

export type HighlightOffer = (typeof HIGHLIGHT_OFFERS)[number];

const EVENT_NAME = 'aypik:highlight-offer';

export function parseHighlightOffer(value: unknown): HighlightOffer | null {
  return HIGHLIGHT_OFFERS.includes(value as HighlightOffer)
    ? (value as HighlightOffer)
    : null;
}

export function offerCardDomId(offer: HighlightOffer): string {
  return `offer-card-${offer}`;
}

export function readHighlightOfferFromUrl(): HighlightOffer | null {
  if (typeof window === 'undefined') return null;
  return parseHighlightOffer(
    new URLSearchParams(window.location.search).get(HIGHLIGHT_OFFER_PARAM)
  );
}

export function consumeHighlightOfferFromUrl(): HighlightOffer | null {
  const offer = readHighlightOfferFromUrl();
  if (!offer || typeof window === 'undefined') return offer;
  const url = new URL(window.location.href);
  url.searchParams.delete(HIGHLIGHT_OFFER_PARAM);
  if (url.searchParams.get('open') === 'profile') {
    url.searchParams.delete('open');
  }
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  return offer;
}

/** Ouvre l’onglet Profil et met en avant la carte d’offre visée. */
export function openHighlightOffer(offer: HighlightOffer) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('open', 'profile');
  url.searchParams.set(HIGHLIGHT_OFFER_PARAM, offer);
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, { detail: { offer } })
  );
}

export function subscribeHighlightOffer(
  handler: (offer: HighlightOffer) => void
): () => void {
  const onEvent = (event: Event) => {
    const offer = parseHighlightOffer(
      (event as CustomEvent<{ offer?: unknown }>).detail?.offer
    );
    if (offer) handler(offer);
  };
  window.addEventListener(EVENT_NAME, onEvent);
  return () => window.removeEventListener(EVENT_NAME, onEvent);
}
