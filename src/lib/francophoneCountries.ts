/**
 * Pays et territoires francophones (§7). Liste validée.
 * Réglage unique côté client ; miroir SQL : platform_settings.francophone_country_codes
 */
export const FRANCOPHONE_COUNTRY_CODES = [
  'FR',
  'GP',
  'MQ',
  'GF',
  'RE',
  'YT',
  'PM',
  'BL',
  'MF',
  'NC',
  'PF',
  'WF',
  'BE',
  'CH',
  'LU',
  'MC',
  'CA',
  'HT',
  'BJ',
  'BF',
  'BI',
  'CM',
  'CF',
  'TD',
  'KM',
  'CG',
  'CD',
  'CI',
  'DJ',
  'GA',
  'GN',
  'GQ',
  'MG',
  'ML',
  'NE',
  'RW',
  'SN',
  'SC',
  'TG',
  'VU',
] as const;

const FRANCOPHONE_SET = new Set<string>(FRANCOPHONE_COUNTRY_CODES);

export function isFrancophoneCountry(iso2: string | null | undefined): boolean {
  const code = String(iso2 || 'FR')
    .trim()
    .toUpperCase();
  return FRANCOPHONE_SET.has(code || 'FR');
}
