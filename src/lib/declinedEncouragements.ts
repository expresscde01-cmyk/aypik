/**
 * Phrases d’encouragement après un refus de Like / Flash.
 * Pioche sans remise (mélange) : une phrase ne revient pas avant
 * que tout le cycle soit épuisé, et pas deux fois de suite à la
 * jointure de deux cycles.
 */
import i18n from '../i18n/config';

function loadEncouragements(): string[] {
  const raw = i18n.t('notifications.encouragements', { returnObjects: true });
  if (Array.isArray(raw) && raw.length > 0) return raw.map(String);
  return [];
}

export function declinedEncouragements(): string[] {
  return loadEncouragements();
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = items[i];
    items[i] = items[j];
    items[j] = current;
  }
  return items;
}

let deck: string[] = [];
let lastDrawn: string | null = null;
const assigned = new Map<string, string>();

function resetDeck(): void {
  deck = [];
  lastDrawn = null;
  assigned.clear();
}

i18n.on('languageChanged', resetDeck);

function refillDeck(): void {
  const next = shuffleInPlace([...loadEncouragements()]);
  if (lastDrawn && next.length > 1 && next[next.length - 1] === lastDrawn) {
    const swapAt = Math.floor(Math.random() * (next.length - 1));
    const last = next[next.length - 1];
    next[next.length - 1] = next[swapAt];
    next[swapAt] = last;
  }
  deck = next;
}

/** Phrase stable pour une notification donnée (pioche sans remise). */
export function pickDeclinedEncouragement(key: string): string {
  const existing = assigned.get(key);
  if (existing) return existing;
  if (deck.length === 0) refillDeck();
  const phrase = deck.pop() ?? loadEncouragements()[0] ?? '';
  lastDrawn = phrase;
  assigned.set(key, phrase);
  return phrase;
}
