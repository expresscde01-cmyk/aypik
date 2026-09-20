import { t, i18n } from '@/i18n/t';
import { parseProfileGender } from '@/lib/dating';

export const MAX_TEMPERAMENT = 5;

export type TemperamentFamilyId =
  | 'energy'
  | 'social'
  | 'communication'
  | 'heart'
  | 'mind'
  | 'attitude';

export type TemperamentFamily = {
  id: TemperamentFamilyId;
  keys: readonly string[];
};

/** Graduation du moins au plus intense — ne pas trier autrement. */
export const TEMPERAMENT_FAMILIES: readonly TemperamentFamily[] = [
  {
    id: 'energy',
    keys: ['calm', 'settled', 'dynamic', 'hyper'],
  },
  {
    id: 'social',
    keys: ['homebody', 'introvert', 'sociable', 'extrovert', 'needs_company'],
  },
  {
    id: 'communication',
    keys: ['discreet', 'listener', 'communicative', 'talkative'],
  },
  {
    id: 'heart',
    keys: ['distant', 'empathic', 'sensitive', 'tender', 'warm', 'romantic'],
  },
  {
    id: 'mind',
    keys: ['rational', 'thinker', 'curious', 'creative', 'funny'],
  },
  {
    id: 'attitude',
    keys: ['organized', 'mature', 'spontaneous', 'adventurous', 'carefree'],
  },
];

export const TEMPERAMENT_KEY_ORDER: readonly string[] =
  TEMPERAMENT_FAMILIES.flatMap((family) => family.keys);

export const TEMPERAMENT_KEY_SET = new Set<string>(TEMPERAMENT_KEY_ORDER);

export function sanitizeTemperament(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const key = raw.trim();
    if (!key || !TEMPERAMENT_KEY_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    next.push(key);
    if (next.length >= MAX_TEMPERAMENT) break;
  }
  return next;
}

export function orderTemperamentKeys(keys: readonly string[]): string[] {
  const allowed = new Set(sanitizeTemperament([...keys]));
  return TEMPERAMENT_KEY_ORDER.filter((key) => allowed.has(key));
}

function resolveLocale(lang?: string | null): string {
  return (lang || i18n.language || 'fr').slice(0, 2).toLowerCase();
}

/**
 * Libellé accordé au genre du profil concerné (pas du visiteur).
 * EN : une seule forme. Genre absent / autre → masculin.
 */
export function getTemperamentLabel(
  key: string,
  gender?: string | null,
  lang?: string | null
): string {
  if (!key || !TEMPERAMENT_KEY_SET.has(key)) return '';
  const locale = resolveLocale(lang);
  if (locale === 'en') {
    const label = t(`temperament.items.${key}`, { lng: 'en' });
    return label.startsWith('temperament.') ? key : label;
  }
  const form = parseProfileGender(gender) === 'femme' ? 'f' : 'm';
  const labelled = t(`temperament.items.${key}.${form}`, { lng: locale });
  if (!labelled.startsWith('temperament.')) return labelled;
  const fallback = t(`temperament.items.${key}.m`, { lng: locale });
  return fallback.startsWith('temperament.') ? key : fallback;
}

export function temperamentDotOpacity(index: number, count: number): number {
  if (count <= 1) return 0.7;
  return 0.25 + 0.75 * (index / (count - 1));
}
