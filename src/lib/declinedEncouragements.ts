/**
 * Phrases d’encouragement après un refus de Like / Flash.
 * Pioche sans remise (mélange) : une phrase ne revient pas avant
 * que tout le cycle soit épuisé, et pas deux fois de suite à la
 * jointure de deux cycles.
 */
export const DECLINED_ENCOURAGEMENTS = [
  "D'autres profils t'attendent sur la page Découvrir.",
  "Pas de panique, d'autres profils t'attendent !",
  "Tourne la page, de nouvelles suggestions n'attendent que toi !",
  'Fonce voir les suggestions du moment pour rebondir !',
  "Ce n'est que partie remise, continue d'explorer.",
  "Ça arrive ! Le profil idéal est encore un peu plus loin.",
  'Un petit refus qui laisse la place à de belles rencontres.',
  'Un refus laissant la place à de belles histoires à vivre.',
  "Un petit refus pour mieux laisser place à l'inattendu.",
  'Pas le bon match, mais la route est pleine de belles surprises.',
  "Pas le bon match mais l'aventure continue !",
  'Pas le bon match, la vie est encore pleine de surprises.',
  'Passe au profil suivant !',
  'La route continue, va jeter un œil aux nouveautés.',
  'Fonce pour la suite de tes recherches !',
] as const;

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

function refillDeck(): void {
  const next = shuffleInPlace([...DECLINED_ENCOURAGEMENTS]);
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
  const phrase = deck.pop() ?? DECLINED_ENCOURAGEMENTS[0];
  lastDrawn = phrase;
  assigned.set(key, phrase);
  return phrase;
}
