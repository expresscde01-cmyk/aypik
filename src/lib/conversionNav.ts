import { SITE_FREE_MODE } from '@/lib/founderCopy';

export const HIGHLIGHT_OFFER_PARAM = 'highlightOffer';

export const HIGHLIGHT_OFFERS = [
  'basique',
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
  if (SITE_FREE_MODE) return;
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('open', 'profile');
  url.searchParams.set(HIGHLIGHT_OFFER_PARAM, offer);
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, { detail: { offer } })
  );
}

const COLD_MESSAGE_EVENT = 'aypik:messages-without-match-offer';

/** Ouvre Mon profil sur les offres, y compris pendant le lancement. */
export function openMessagesWithoutMatchOffers() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('open', 'profile');
  url.searchParams.set('coldMessage', '1');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(new CustomEvent(COLD_MESSAGE_EVENT));
}

export function consumeColdMessageOfferFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get('coldMessage') !== '1') return false;
  url.searchParams.delete('coldMessage');
  if (url.searchParams.get('open') === 'profile') {
    url.searchParams.delete('open');
  }
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  return true;
}

const OPEN_ACCOUNT_MENU_EVENT = 'aypik:open-account-menu';

export function openAccountMenu() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_ACCOUNT_MENU_EVENT));
}

export function subscribeOpenAccountMenu(handler: () => void): () => void {
  const onEvent = () => handler();
  window.addEventListener(OPEN_ACCOUNT_MENU_EVENT, onEvent);
  return () => window.removeEventListener(OPEN_ACCOUNT_MENU_EVENT, onEvent);
}

export function subscribeColdMessageOffer(handler: () => void): () => void {
  const onEvent = () => handler();
  window.addEventListener(COLD_MESSAGE_EVENT, onEvent);
  return () => window.removeEventListener(COLD_MESSAGE_EVENT, onEvent);
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
