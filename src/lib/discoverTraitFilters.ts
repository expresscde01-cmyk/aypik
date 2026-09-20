import {
  TEMPERAMENT_FAMILIES,
  TEMPERAMENT_KEY_SET,
  type TemperamentFamilyId,
} from '@/lib/temperament';
import {
  MAX_SPOKEN_LANGUAGES,
  isIso6391Code,
  isSpokenLevel,
  type Iso6391Code,
  type SpokenLanguage,
  type SpokenLevel,
} from '@/lib/spokenLanguages';

export const MAX_TEMPERAMENT_FILTER_KEYS = 30;

export type TemperamentFilterMap = Partial<
  Record<TemperamentFamilyId, string[]>
>;

export type MinLanguageLevelFilter = 'all' | SpokenLevel;

const FAMILY_IDS = new Set<string>(
  TEMPERAMENT_FAMILIES.map((family) => family.id)
);

const LEVEL_RANK: Record<SpokenLevel, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  native: 4,
};

export function languageLevelRank(level: SpokenLevel | string | null | undefined): number {
  if (level && isSpokenLevel(level)) return LEVEL_RANK[level];
  return 0;
}

export function minLanguageLevelRank(min: MinLanguageLevelFilter): number {
  if (min === 'all') return 1;
  return LEVEL_RANK[min];
}

export function sanitizeTemperamentFilter(raw: unknown): TemperamentFilterMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const rec = raw as Record<string, unknown>;
  const out: TemperamentFilterMap = {};
  let remaining = MAX_TEMPERAMENT_FILTER_KEYS;
  for (const family of TEMPERAMENT_FAMILIES) {
    if (remaining <= 0) break;
    const allowed = new Set(family.keys);
    const rawKeys = rec[family.id];
    if (!Array.isArray(rawKeys)) continue;
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const item of rawKeys) {
      if (typeof item !== 'string') continue;
      const key = item.trim();
      if (!allowed.has(key) || !TEMPERAMENT_KEY_SET.has(key) || seen.has(key)) {
        continue;
      }
      seen.add(key);
      keys.push(key);
      remaining -= 1;
      if (remaining <= 0) break;
    }
    if (keys.length > 0) out[family.id] = keys;
  }
  return out;
}

export function temperamentFilterKeys(filter: TemperamentFilterMap): string[] {
  return TEMPERAMENT_FAMILIES.flatMap((family) => filter[family.id] ?? []);
}

export function temperamentFilterKeyCount(filter: TemperamentFilterMap): number {
  return temperamentFilterKeys(filter).length;
}

export function isTemperamentFilterActive(filter: TemperamentFilterMap): boolean {
  return temperamentFilterKeyCount(filter) > 0;
}

export function temperamentFilterToRpc(
  filter: TemperamentFilterMap
): Record<string, string[]> | null {
  const sanitized = sanitizeTemperamentFilter(filter);
  if (!isTemperamentFilterActive(sanitized)) return null;
  const payload: Record<string, string[]> = {};
  for (const family of TEMPERAMENT_FAMILIES) {
    const keys = sanitized[family.id];
    if (keys && keys.length > 0) payload[family.id] = keys;
  }
  return payload;
}

export function toggleTemperamentFilterKey(
  filter: TemperamentFilterMap,
  key: string
): TemperamentFilterMap {
  const family = TEMPERAMENT_FAMILIES.find((row) =>
    (row.keys as readonly string[]).includes(key)
  );
  if (!family) return sanitizeTemperamentFilter(filter);
  const current = new Set(filter[family.id] || []);
  if (current.has(key)) current.delete(key);
  else current.add(key);
  return sanitizeTemperamentFilter({
    ...filter,
    [family.id]: [...current],
  });
}

export function profileMatchesTemperamentFilter(
  profileKeys: readonly string[] | null | undefined,
  filter: TemperamentFilterMap
): boolean {
  const sanitized = sanitizeTemperamentFilter(filter);
  if (!isTemperamentFilterActive(sanitized)) return true;
  const have = new Set(
    (profileKeys || []).filter((key) => TEMPERAMENT_KEY_SET.has(key))
  );
  if (have.size === 0) return false;
  for (const family of TEMPERAMENT_FAMILIES) {
    const wanted = sanitized[family.id];
    if (!wanted || wanted.length === 0) continue;
    if (!wanted.some((key) => have.has(key))) return false;
  }
  return true;
}

export function sanitizeLanguageFilterCodes(raw: unknown): Iso6391Code[] {
  if (!Array.isArray(raw)) return [];
  const out: Iso6391Code[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const code = String(item ?? '')
      .trim()
      .toLowerCase();
    if (!isIso6391Code(code) || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= MAX_SPOKEN_LANGUAGES) break;
  }
  return out;
}

export function sanitizeMinLanguageLevel(raw: unknown): MinLanguageLevelFilter {
  if (raw === 'all' || raw == null || raw === '') return 'all';
  const value = String(raw).trim();
  if (value === 'all') return 'all';
  if (isSpokenLevel(value)) return value;
  return 'all';
}

export function isLanguageFilterActive(codes: readonly string[]): boolean {
  return sanitizeLanguageFilterCodes([...codes]).length > 0;
}

export function profileMatchesLanguageFilter(
  languages: readonly SpokenLanguage[] | null | undefined,
  codes: readonly string[],
  minLevel: MinLanguageLevelFilter = 'all'
): boolean {
  const wanted = sanitizeLanguageFilterCodes([...codes]);
  if (wanted.length === 0) return true;
  const minRank = minLanguageLevelRank(sanitizeMinLanguageLevel(minLevel));
  const wantedSet = new Set(wanted);
  if (!languages || languages.length === 0) return false;
  return languages.some(
    (item) =>
      wantedSet.has(item.code) && languageLevelRank(item.level) >= minRank
  );
}

export function isFamilyId(value: string): value is TemperamentFamilyId {
  return FAMILY_IDS.has(value);
}
