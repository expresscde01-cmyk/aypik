/** ISO 639-1 (2 lettres). Source unique pour validation client / SQL. */
export const ISO_639_1_CODES = [
  'aa', 'ab', 'ae', 'af', 'ak', 'am', 'an', 'ar', 'as', 'av', 'ay', 'az',
  'ba', 'be', 'bg', 'bh', 'bi', 'bm', 'bn', 'bo', 'br', 'bs',
  'ca', 'ce', 'ch', 'co', 'cr', 'cs', 'cu', 'cv', 'cy',
  'da', 'de', 'dv', 'dz',
  'ee', 'el', 'en', 'eo', 'es', 'et', 'eu',
  'fa', 'ff', 'fi', 'fj', 'fo', 'fr', 'fy',
  'ga', 'gd', 'gl', 'gn', 'gu', 'gv',
  'ha', 'he', 'hi', 'ho', 'hr', 'ht', 'hu', 'hy', 'hz',
  'ia', 'id', 'ie', 'ig', 'ii', 'ik', 'io', 'is', 'it', 'iu',
  'ja', 'jv',
  'ka', 'kg', 'ki', 'kj', 'kk', 'kl', 'km', 'kn', 'ko', 'kr', 'ks', 'ku', 'kv', 'kw', 'ky',
  'la', 'lb', 'lg', 'li', 'ln', 'lo', 'lt', 'lu', 'lv',
  'mg', 'mh', 'mi', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my',
  'na', 'nb', 'nd', 'ne', 'ng', 'nl', 'nn', 'no', 'nr', 'nv', 'ny',
  'oc', 'oj', 'om', 'or', 'os',
  'pa', 'pi', 'pl', 'ps', 'pt',
  'qu',
  'rm', 'rn', 'ro', 'ru', 'rw',
  'sa', 'sc', 'sd', 'se', 'sg', 'si', 'sk', 'sl', 'sm', 'sn', 'so', 'sq', 'sr', 'ss', 'st', 'su', 'sv', 'sw',
  'ta', 'te', 'tg', 'th', 'ti', 'tk', 'tl', 'tn', 'to', 'tr', 'ts', 'tt', 'tw', 'ty',
  'ug', 'uk', 'ur', 'uz',
  've', 'vi', 'vo',
  'wa', 'wo',
  'xh',
  'yi', 'yo',
  'za', 'zh', 'zu',
] as const;

export type Iso6391Code = (typeof ISO_639_1_CODES)[number];

export const FEATURED_LANGUAGE_CODES: readonly Iso6391Code[] = [
  'fr',
  'en',
  'es',
  'de',
  'it',
  'pt',
  'ar',
];

export const SPOKEN_LEVELS = [
  'beginner',
  'intermediate',
  'advanced',
  'native',
] as const;

export type SpokenLevel = (typeof SPOKEN_LEVELS)[number];

export type SpokenLanguage = {
  code: Iso6391Code;
  level: SpokenLevel;
};

export const MAX_SPOKEN_LANGUAGES = 8;

const CODE_SET = new Set<string>(ISO_639_1_CODES);
const LEVEL_SET = new Set<string>(SPOKEN_LEVELS);

export function isIso6391Code(value: string): value is Iso6391Code {
  return CODE_SET.has(value);
}

export function isSpokenLevel(value: string): value is SpokenLevel {
  return LEVEL_SET.has(value);
}

export function foldLanguageQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

const displayNamesCache = new Map<string, Intl.DisplayNames>();

function displayNamesFor(locale: string): Intl.DisplayNames {
  const key = locale.slice(0, 2);
  const cached = displayNamesCache.get(key);
  if (cached) return cached;
  const names = new Intl.DisplayNames([key], { type: 'language' });
  displayNamesCache.set(key, names);
  return names;
}

export function languageDisplayName(code: string, locale: string): string {
  const raw = displayNamesFor(locale).of(code) || code;
  if (!raw) return code;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export type SpokenDraft = {
  code: Iso6391Code;
  level: SpokenLevel | null;
};

export function parseSpokenLanguages(raw: unknown): SpokenLanguage[] {
  if (!Array.isArray(raw)) return [];
  const out: SpokenLanguage[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const code = String(rec.code ?? '')
      .trim()
      .toLowerCase();
    const level = String(rec.level ?? '').trim();
    if (!isIso6391Code(code) || !isSpokenLevel(level) || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, level });
    if (out.length >= MAX_SPOKEN_LANGUAGES) break;
  }
  return out;
}

/** Ne conserve que les langues avec un niveau choisi, 8 max, sans doublon. */
export function sanitizeSpokenLanguages(
  drafts: readonly SpokenDraft[] | unknown
): SpokenLanguage[] {
  if (!Array.isArray(drafts)) return parseSpokenLanguages(drafts);
  return parseSpokenLanguages(
    drafts.map((item) =>
      item && typeof item === 'object'
        ? { code: (item as SpokenDraft).code, level: (item as SpokenDraft).level }
        : item
    )
  );
}

export function hasNativeSpokenLanguage(
  langs: readonly SpokenLanguage[] | null | undefined
): boolean {
  return Boolean(langs?.some((item) => item.level === 'native'));
}

export function orderSpokenLanguagesForDisplay(
  langs: readonly SpokenLanguage[]
): SpokenLanguage[] {
  const natives = langs.filter((item) => item.level === 'native');
  const others = langs.filter((item) => item.level !== 'native');
  return [...natives, ...others];
}

export function listedLanguageCodes(
  query: string,
  locale: string,
  exclude: readonly string[]
): Iso6391Code[] {
  const folded = foldLanguageQuery(query);
  const excluded = new Set(exclude);
  const all = ISO_639_1_CODES.filter((code) => !excluded.has(code));
  const match = (code: Iso6391Code) => {
    if (!folded) return true;
    if (code.includes(folded)) return true;
    return foldLanguageQuery(languageDisplayName(code, locale)).includes(folded);
  };
  const filtered = all.filter(match);
  if (folded) {
    return [...filtered].sort((a, b) =>
      languageDisplayName(a, locale).localeCompare(
        languageDisplayName(b, locale),
        locale,
        { sensitivity: 'base' }
      )
    );
  }
  const featured = FEATURED_LANGUAGE_CODES.filter((code) =>
    filtered.includes(code)
  );
  const rest = filtered
    .filter((code) => !FEATURED_LANGUAGE_CODES.includes(code))
    .sort((a, b) =>
      languageDisplayName(a, locale).localeCompare(
        languageDisplayName(b, locale),
        locale,
        { sensitivity: 'base' }
      )
    );
  return [...featured, ...rest];
}
