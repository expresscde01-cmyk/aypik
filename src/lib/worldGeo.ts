/**
 * Géographie mondiale déclarative (pays → zone produit).
 * Miroir de public.world_countries — garder SQL et TS alignés.
 * Pas de GPS : coordonnées = centre de ville déclarée (GeoNames).
 */

export type WorldZone =
  | 'europe'
  | 'north_america'
  | 'central_america'
  | 'south_america'
  | 'africa'
  | 'asia'
  | 'oceania';

export type WorldZoneFilter = WorldZone | 'worldwide';

export type WorldCountry = {
  iso2: string;
  nameFr: string;
  zone: WorldZone;
};

/** Ligne / section du sous-panneau « Un pays précis » (France-monde et International). */
export type GeoCountryMenuRow = {
  iso2: string;
  label: string;
};

export type GeoCountryMenuSection = {
  title: string;
  rows: readonly GeoCountryMenuRow[];
};

export const WORLD_ZONE_LABEL: Record<WorldZoneFilter, string> = {
  europe: 'Europe',
  north_america: 'Amérique du Nord',
  central_america: 'Amérique centrale',
  south_america: 'Amérique du Sud',
  africa: 'Afrique',
  asia: 'Asie',
  oceania: 'Océanie',
  worldwide: 'PARTOUT',
};

export const WORLD_ZONE_CONTINENTS: readonly WorldZone[] = [
  'europe',
  'north_america',
  'central_america',
  'south_america',
  'africa',
  'asia',
  'oceania',
];

export const WORLD_ZONE_OPTIONS: readonly WorldZoneFilter[] = [
  ...WORLD_ZONE_CONTINENTS,
  'worldwide',
];

/** ISO2 : métropole + territoires français (miroir world_countries.is_french_territory). */
export const FRENCH_TERRITORY_CODES = [
  'FR',
  'GP',
  'MQ',
  'GF',
  'RE',
  'YT',
  'PF',
  'NC',
  'WF',
  'PM',
  'BL',
  'MF',
  'TF',
] as const;

/** Outre-mer du second menu LA FRANCE DANS LE MONDE (sans la métropole). */
export const FRENCH_OVERSEAS_MENU = [
  { iso2: 'GP', label: 'Guadeloupe' },
  { iso2: 'MQ', label: 'Martinique' },
  { iso2: 'GF', label: 'Guyane' },
  { iso2: 'RE', label: 'La Réunion' },
  { iso2: 'YT', label: 'Mayotte' },
  { iso2: 'NC', label: 'Nouvelle-Calédonie' },
  { iso2: 'PF', label: 'Polynésie française' },
  { iso2: 'PM', label: 'Saint-Pierre-et-Miquelon' },
  { iso2: 'BL', label: 'Saint-Barthélemy' },
  { iso2: 'MF', label: 'Saint-Martin' },
  { iso2: 'WF', label: 'Wallis-et-Futuna' },
  { iso2: 'TF', label: 'Terres australes françaises' },
] as const;

/** Pays francophones du second menu LA FRANCE DANS LE MONDE. */
export const FRANCOPHONE_MENU = [
  { iso2: 'BE', label: 'Belgique' },
  { iso2: 'CH', label: 'Suisse' },
  { iso2: 'LU', label: 'Luxembourg' },
  { iso2: 'MC', label: 'Monaco' },
  { iso2: 'CA', label: 'Canada' },
  { iso2: 'SN', label: 'Sénégal' },
  { iso2: 'CI', label: 'Côte d’Ivoire' },
  { iso2: 'ML', label: 'Mali' },
  { iso2: 'BF', label: 'Burkina Faso' },
  { iso2: 'NE', label: 'Niger' },
  { iso2: 'GN', label: 'Guinée' },
  { iso2: 'BJ', label: 'Bénin' },
  { iso2: 'TG', label: 'Togo' },
  { iso2: 'CM', label: 'Cameroun' },
  { iso2: 'GA', label: 'Gabon' },
  { iso2: 'CG', label: 'Congo' },
  { iso2: 'CD', label: 'RD Congo' },
  { iso2: 'TD', label: 'Tchad' },
  { iso2: 'CF', label: 'République centrafricaine' },
  { iso2: 'RW', label: 'Rwanda' },
  { iso2: 'BI', label: 'Burundi' },
  { iso2: 'DJ', label: 'Djibouti' },
  { iso2: 'KM', label: 'Comores' },
  { iso2: 'MG', label: 'Madagascar' },
  { iso2: 'MA', label: 'Maroc' },
  { iso2: 'TN', label: 'Tunisie' },
  { iso2: 'DZ', label: 'Algérie' },
  { iso2: 'MR', label: 'Mauritanie' },
  { iso2: 'GQ', label: 'Guinée équatoriale' },
  { iso2: 'SC', label: 'Seychelles' },
  { iso2: 'HT', label: 'Haïti' },
  { iso2: 'LB', label: 'Liban' },
  { iso2: 'VU', label: 'Vanuatu' },
] as const;

export const FRANCE_WORLD_CHOICE_ALL = 'all';
export const FRANCE_WORLD_CHOICE_OVERSEAS = 'overseas';
export const FRANCE_WORLD_CHOICE_FRANCOPHONE = 'francophone';

export const FRANCE_WORLD_CHOICE_LABEL = {
  all: 'PARTOUT',
  overseas: 'TOUS LES TERRITOIRES FRANÇAIS D’OUTRE-MER',
  francophone: 'TOUS LES PAYS FRANCOPHONES',
} as const;

export type FranceWorldGroupChoice =
  | typeof FRANCE_WORLD_CHOICE_ALL
  | typeof FRANCE_WORLD_CHOICE_OVERSEAS
  | typeof FRANCE_WORLD_CHOICE_FRANCOPHONE;

export type FranceWorldChoice = FranceWorldGroupChoice | string;

export const FRANCE_WORLD_COUNTRY_SECTIONS: readonly GeoCountryMenuSection[] = [
  {
    title: 'TERRITOIRES FRANÇAIS D’OUTRE-MER',
    rows: [...FRENCH_OVERSEAS_MENU].sort((a, b) =>
      compareFrenchCountryLabel(a.label, b.label)
    ),
  },
  {
    title: 'PAYS FRANCOPHONES',
    rows: [...FRANCOPHONE_MENU].sort((a, b) =>
      compareFrenchCountryLabel(a.label, b.label)
    ),
  },
];

const FRANCE_WORLD_ROWS = [
  ...FRENCH_OVERSEAS_MENU,
  ...FRANCOPHONE_MENU,
] as const;

const FRANCE_WORLD_ISO: ReadonlySet<string> = new Set(
  FRANCE_WORLD_ROWS.map((row) => row.iso2)
);

function isFranceWorldGroupChoice(
  value: string
): value is FranceWorldGroupChoice {
  return (
    value === FRANCE_WORLD_CHOICE_ALL ||
    value === FRANCE_WORLD_CHOICE_OVERSEAS ||
    value === FRANCE_WORLD_CHOICE_FRANCOPHONE
  );
}

export function isFranceWorldMenuIso(
  countryCode: string | null | undefined
): boolean {
  if (!countryCode) return false;
  return FRANCE_WORLD_ISO.has(countryCode.trim().toUpperCase());
}

export function franceWorldCountryLabel(
  countryCode: string | null | undefined
): string {
  if (!countryCode) return '';
  const iso = countryCode.trim().toUpperCase();
  return FRANCE_WORLD_ROWS.find((row) => row.iso2 === iso)?.label ?? '';
}

/** Un seul choix. Défaut = les deux ensembles (PARTOUT). */
export function parseFranceWorldChoice(
  raw: unknown,
  legacyCodes?: unknown
): FranceWorldChoice {
  const value = String(raw || '')
    .trim()
    .toUpperCase();
  if (raw != null && String(raw).trim() !== '') {
    const lower = String(raw).trim().toLowerCase();
    if (isFranceWorldGroupChoice(lower)) return lower;
  }
  if (Array.isArray(legacyCodes) && legacyCodes.length === 1) {
    const iso = String(legacyCodes[0] || '')
      .trim()
      .toUpperCase();
    if (FRANCE_WORLD_ISO.has(iso)) return iso;
  }
  if (FRANCE_WORLD_ISO.has(value)) return value;
  return FRANCE_WORLD_CHOICE_ALL;
}

export function parseFranceWorldCodes(
  raw: unknown,
  legacyChoice?: unknown
): string[] {
  const out: string[] = [];
  const add = (value: unknown) => {
    const iso = String(value || '')
      .trim()
      .toUpperCase();
    if (isFranceWorldMenuIso(iso) && !out.includes(iso)) out.push(iso);
  };
  if (Array.isArray(raw)) raw.forEach(add);
  else add(raw);
  if (out.length === 0) add(legacyChoice);
  return out;
}

export function toggleIsoSelection(
  current: readonly string[],
  iso2: string
): string[] {
  const iso = iso2.trim().toUpperCase();
  if (!iso) return [...current];
  if (current.includes(iso)) return current.filter((code) => code !== iso);
  return [...current, iso];
}

export function countryListClosedLabel(
  codes: readonly string[],
  labelOf: (iso: string) => string
): string {
  return [...codes]
    .map((iso) => ({ iso, label: labelOf(iso) }))
    .filter((row) => row.label)
    .sort((a, b) => compareFrenchCountryLabel(a.label, b.label))
    .map((row) => row.label)
    .join(', ');
}

export function franceWorldClosedLabel(choice: FranceWorldChoice): string {
  if (isFranceWorldGroupChoice(choice)) {
    return FRANCE_WORLD_CHOICE_LABEL[choice];
  }
  return franceWorldCountryLabel(choice) || FRANCE_WORLD_CHOICE_LABEL.all;
}

const OVERSEAS_ISOS: readonly string[] = FRENCH_OVERSEAS_MENU.map(
  (row) => row.iso2
);
const FRANCOPHONE_ISOS: readonly string[] = FRANCOPHONE_MENU.map(
  (row) => row.iso2
);
const ALL_FRANCE_WORLD_ISOS: readonly string[] = [
  ...OVERSEAS_ISOS,
  ...FRANCOPHONE_ISOS,
];

/** NFD + sans diacritiques ni apostrophes, pour la recherche « Un pays précis ». */
export function foldFranceWorldLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[''`´’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function franceWorldLabelMatches(label: string, query: string): boolean {
  const foldedQuery = foldFranceWorldLabel(query);
  if (!foldedQuery) return true;
  return foldFranceWorldLabel(label).includes(foldedQuery);
}

/** Ordre alphabétique français (accents ignorés pour le rang). */
export function compareFrenchCountryLabel(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { sensitivity: 'base' });
}

/**
 * ISO2 réellement filtrés par le second menu.
 * PARTOUT = outre-mer ∪ francophones (sans la métropole).
 */
export function franceWorldAllowedIsos(
  choice: FranceWorldChoice,
  codes?: readonly string[]
): readonly string[] {
  const precise = parseFranceWorldCodes(codes);
  if (precise.length > 0) return precise;
  if (choice === FRANCE_WORLD_CHOICE_OVERSEAS) return OVERSEAS_ISOS;
  if (choice === FRANCE_WORLD_CHOICE_FRANCOPHONE) return FRANCOPHONE_ISOS;
  if (isFranceWorldMenuIso(choice)) {
    return [choice.trim().toUpperCase()];
  }
  return ALL_FRANCE_WORLD_ISOS;
}

export function matchesFranceWorldChoice(
  countryCode: string | null | undefined,
  choice: FranceWorldChoice,
  codes?: readonly string[]
): boolean {
  const iso = String(countryCode || '')
    .trim()
    .toUpperCase();
  if (!iso) return false;
  return franceWorldAllowedIsos(choice, codes).includes(iso);
}

export function isFrenchTerritoryIso(
  countryCode: string | null | undefined
): boolean {
  if (!countryCode) return false;
  return (FRENCH_TERRITORY_CODES as readonly string[]).includes(
    countryCode.trim().toUpperCase()
  );
}

export function isWorldwideZones(zones: readonly string[]): boolean {
  return zones.length === 0;
}

export function parseWorldZones(raw: unknown, legacyWorldZone?: unknown): WorldZone[] {
  if (Array.isArray(raw)) {
    const zones = raw.filter((value): value is WorldZone => isWorldZone(String(value)));
    return [...new Set(zones)];
  }
  const legacy = String(legacyWorldZone || '');
  if (isWorldZone(legacy)) return [legacy];
  return [];
}

/** PARTOUT vide la liste ; un continent s’ajoute ou se retire. Plus aucun continent → PARTOUT. */
export function toggleWorldZoneSelection(
  current: readonly WorldZone[],
  clicked: WorldZoneFilter
): WorldZone[] {
  if (clicked === 'worldwide') return [];
  if (current.includes(clicked)) {
    return current.filter((zone) => zone !== clicked);
  }
  return [...current, clicked];
}

export function worldZonesClosedLabel(zones: readonly WorldZone[]): string {
  if (zones.length === 0) return WORLD_ZONE_LABEL.worldwide;
  return zones.map((zone) => WORLD_ZONE_LABEL[zone]).join(', ');
}

const COUNTRY_ROWS: ReadonlyArray<readonly [string, string, WorldZone]> = [
  ['AD', 'Andorre', 'europe'],
  ['AE', 'Émirats arabes unis', 'asia'],
  ['AF', 'Afghanistan', 'asia'],
  ['AG', 'Antigua-et-Barbuda', 'central_america'],
  ['AI', 'Anguilla', 'central_america'],
  ['AL', 'Albanie', 'europe'],
  ['AM', 'Arménie', 'asia'],
  ['AO', 'Angola', 'africa'],
  ['AQ', 'Antarctique', 'oceania'],
  ['AR', 'Argentine', 'south_america'],
  ['AS', 'Samoa américaines', 'oceania'],
  ['AT', 'Autriche', 'europe'],
  ['AU', 'Australie', 'oceania'],
  ['AW', 'Aruba', 'central_america'],
  ['AX', 'Åland', 'europe'],
  ['AZ', 'Azerbaïdjan', 'asia'],
  ['BA', 'Bosnie-Herzégovine', 'europe'],
  ['BB', 'Barbade', 'central_america'],
  ['BD', 'Bangladesh', 'asia'],
  ['BE', 'Belgique', 'europe'],
  ['BF', 'Burkina Faso', 'africa'],
  ['BG', 'Bulgarie', 'europe'],
  ['BH', 'Bahreïn', 'asia'],
  ['BI', 'Burundi', 'africa'],
  ['BJ', 'Bénin', 'africa'],
  ['BL', 'Saint-Barthélemy', 'central_america'],
  ['BM', 'Bermudes', 'north_america'],
  ['BN', 'Brunei', 'asia'],
  ['BO', 'Bolivie', 'south_america'],
  ['BQ', 'Bonaire, Saint-Eustache et Saba', 'central_america'],
  ['BR', 'Brésil', 'south_america'],
  ['BS', 'Bahamas', 'central_america'],
  ['BT', 'Bhoutan', 'asia'],
  ['BV', 'Île Bouvet', 'oceania'],
  ['BW', 'Botswana', 'africa'],
  ['BY', 'Biélorussie', 'europe'],
  ['BZ', 'Belize', 'central_america'],
  ['CA', 'Canada', 'north_america'],
  ['CC', 'Îles Cocos', 'oceania'],
  ['CD', 'Congo (RDC)', 'africa'],
  ['CF', 'République centrafricaine', 'africa'],
  ['CG', 'Congo', 'africa'],
  ['CH', 'Suisse', 'europe'],
  ['CI', 'Côte d’Ivoire', 'africa'],
  ['CK', 'Îles Cook', 'oceania'],
  ['CL', 'Chili', 'south_america'],
  ['CM', 'Cameroun', 'africa'],
  ['CN', 'Chine', 'asia'],
  ['CO', 'Colombie', 'south_america'],
  ['CR', 'Costa Rica', 'central_america'],
  ['CU', 'Cuba', 'central_america'],
  ['CV', 'Cap-Vert', 'africa'],
  ['CW', 'Curaçao', 'central_america'],
  ['CX', 'Île Christmas', 'oceania'],
  ['CY', 'Chypre', 'europe'],
  ['CZ', 'Tchéquie', 'europe'],
  ['DE', 'Allemagne', 'europe'],
  ['DJ', 'Djibouti', 'africa'],
  ['DK', 'Danemark', 'europe'],
  ['DM', 'Dominique', 'central_america'],
  ['DO', 'République dominicaine', 'central_america'],
  ['DZ', 'Algérie', 'africa'],
  ['EC', 'Équateur', 'south_america'],
  ['EE', 'Estonie', 'europe'],
  ['EG', 'Égypte', 'africa'],
  ['EH', 'Sahara occidental', 'africa'],
  ['ER', 'Érythrée', 'africa'],
  ['ES', 'Espagne', 'europe'],
  ['ET', 'Éthiopie', 'africa'],
  ['FI', 'Finlande', 'europe'],
  ['FJ', 'Fidji', 'oceania'],
  ['FK', 'Îles Malouines', 'south_america'],
  ['FM', 'Micronésie', 'oceania'],
  ['FO', 'Îles Féroé', 'europe'],
  ['FR', 'France', 'europe'],
  ['GA', 'Gabon', 'africa'],
  ['GB', 'Royaume-Uni', 'europe'],
  ['GD', 'Grenade', 'central_america'],
  ['GE', 'Géorgie', 'europe'],
  ['GF', 'Guyane', 'south_america'],
  ['GG', 'Guernesey', 'europe'],
  ['GH', 'Ghana', 'africa'],
  ['GI', 'Gibraltar', 'europe'],
  ['GL', 'Groenland', 'north_america'],
  ['GM', 'Gambie', 'africa'],
  ['GN', 'Guinée', 'africa'],
  ['GP', 'Guadeloupe', 'central_america'],
  ['GQ', 'Guinée équatoriale', 'africa'],
  ['GR', 'Grèce', 'europe'],
  ['GS', 'Géorgie du Sud', 'south_america'],
  ['GT', 'Guatemala', 'central_america'],
  ['GU', 'Guam', 'oceania'],
  ['GW', 'Guinée-Bissau', 'africa'],
  ['GY', 'Guyana', 'south_america'],
  ['HK', 'Hong Kong', 'asia'],
  ['HM', 'Îles Heard-et-MacDonald', 'oceania'],
  ['HN', 'Honduras', 'central_america'],
  ['HR', 'Croatie', 'europe'],
  ['HT', 'Haïti', 'central_america'],
  ['HU', 'Hongrie', 'europe'],
  ['ID', 'Indonésie', 'asia'],
  ['IE', 'Irlande', 'europe'],
  ['IL', 'Israël', 'asia'],
  ['IM', 'Île de Man', 'europe'],
  ['IN', 'Inde', 'asia'],
  ['IO', 'Territoire britannique de l’océan Indien', 'asia'],
  ['IQ', 'Irak', 'asia'],
  ['IR', 'Iran', 'asia'],
  ['IS', 'Islande', 'europe'],
  ['IT', 'Italie', 'europe'],
  ['JE', 'Jersey', 'europe'],
  ['JM', 'Jamaïque', 'central_america'],
  ['JO', 'Jordanie', 'asia'],
  ['JP', 'Japon', 'asia'],
  ['KE', 'Kenya', 'africa'],
  ['KG', 'Kirghizistan', 'asia'],
  ['KH', 'Cambodge', 'asia'],
  ['KI', 'Kiribati', 'oceania'],
  ['KM', 'Comores', 'africa'],
  ['KN', 'Saint-Kitts-et-Nevis', 'central_america'],
  ['KP', 'Corée du Nord', 'asia'],
  ['KR', 'Corée du Sud', 'asia'],
  ['KW', 'Koweït', 'asia'],
  ['KY', 'Îles Caïmans', 'central_america'],
  ['KZ', 'Kazakhstan', 'asia'],
  ['LA', 'Laos', 'asia'],
  ['LB', 'Liban', 'asia'],
  ['LC', 'Sainte-Lucie', 'central_america'],
  ['LI', 'Liechtenstein', 'europe'],
  ['LK', 'Sri Lanka', 'asia'],
  ['LR', 'Liberia', 'africa'],
  ['LS', 'Lesotho', 'africa'],
  ['LT', 'Lituanie', 'europe'],
  ['LU', 'Luxembourg', 'europe'],
  ['LV', 'Lettonie', 'europe'],
  ['LY', 'Libye', 'africa'],
  ['MA', 'Maroc', 'africa'],
  ['MC', 'Monaco', 'europe'],
  ['MD', 'Moldavie', 'europe'],
  ['ME', 'Monténégro', 'europe'],
  ['MF', 'Saint-Martin', 'central_america'],
  ['MG', 'Madagascar', 'africa'],
  ['MH', 'Îles Marshall', 'oceania'],
  ['MK', 'Macédoine du Nord', 'europe'],
  ['ML', 'Mali', 'africa'],
  ['MM', 'Myanmar', 'asia'],
  ['MN', 'Mongolie', 'asia'],
  ['MO', 'Macao', 'asia'],
  ['MP', 'Îles Mariannes du Nord', 'oceania'],
  ['MQ', 'Martinique', 'central_america'],
  ['MR', 'Mauritanie', 'africa'],
  ['MS', 'Montserrat', 'central_america'],
  ['MT', 'Malte', 'europe'],
  ['MU', 'Maurice', 'africa'],
  ['MV', 'Maldives', 'asia'],
  ['MW', 'Malawi', 'africa'],
  ['MX', 'Mexique', 'north_america'],
  ['MY', 'Malaisie', 'asia'],
  ['MZ', 'Mozambique', 'africa'],
  ['NA', 'Namibie', 'africa'],
  ['NC', 'Nouvelle-Calédonie', 'oceania'],
  ['NE', 'Niger', 'africa'],
  ['NF', 'Île Norfolk', 'oceania'],
  ['NG', 'Nigeria', 'africa'],
  ['NI', 'Nicaragua', 'central_america'],
  ['NL', 'Pays-Bas', 'europe'],
  ['NO', 'Norvège', 'europe'],
  ['NP', 'Népal', 'asia'],
  ['NR', 'Nauru', 'oceania'],
  ['NU', 'Niue', 'oceania'],
  ['NZ', 'Nouvelle-Zélande', 'oceania'],
  ['OM', 'Oman', 'asia'],
  ['PA', 'Panama', 'central_america'],
  ['PE', 'Pérou', 'south_america'],
  ['PF', 'Polynésie française', 'oceania'],
  ['PG', 'Papouasie-Nouvelle-Guinée', 'oceania'],
  ['PH', 'Philippines', 'asia'],
  ['PK', 'Pakistan', 'asia'],
  ['PL', 'Pologne', 'europe'],
  ['PM', 'Saint-Pierre-et-Miquelon', 'north_america'],
  ['PN', 'Pitcairn', 'oceania'],
  ['PR', 'Porto Rico', 'central_america'],
  ['PS', 'Palestine', 'asia'],
  ['PT', 'Portugal', 'europe'],
  ['PW', 'Palaos', 'oceania'],
  ['PY', 'Paraguay', 'south_america'],
  ['QA', 'Qatar', 'asia'],
  ['RE', 'La Réunion', 'africa'],
  ['RO', 'Roumanie', 'europe'],
  ['RS', 'Serbie', 'europe'],
  ['RU', 'Russie', 'europe'],
  ['RW', 'Rwanda', 'africa'],
  ['SA', 'Arabie saoudite', 'asia'],
  ['SB', 'Îles Salomon', 'oceania'],
  ['SC', 'Seychelles', 'africa'],
  ['SD', 'Soudan', 'africa'],
  ['SE', 'Suède', 'europe'],
  ['SG', 'Singapour', 'asia'],
  ['SH', 'Sainte-Hélène', 'africa'],
  ['SI', 'Slovénie', 'europe'],
  ['SJ', 'Svalbard', 'europe'],
  ['SK', 'Slovaquie', 'europe'],
  ['SL', 'Sierra Leone', 'africa'],
  ['SM', 'Saint-Marin', 'europe'],
  ['SN', 'Sénégal', 'africa'],
  ['SO', 'Somalie', 'africa'],
  ['SR', 'Suriname', 'south_america'],
  ['SS', 'Soudan du Sud', 'africa'],
  ['ST', 'Sao Tomé-et-Principe', 'africa'],
  ['SV', 'Salvador', 'central_america'],
  ['SX', 'Saint-Martin (Pays-Bas)', 'central_america'],
  ['SY', 'Syrie', 'asia'],
  ['SZ', 'Eswatini', 'africa'],
  ['TC', 'Îles Turques-et-Caïques', 'central_america'],
  ['TD', 'Tchad', 'africa'],
  ['TF', 'Terres australes françaises', 'oceania'],
  ['TG', 'Togo', 'africa'],
  ['TH', 'Thaïlande', 'asia'],
  ['TJ', 'Tadjikistan', 'asia'],
  ['TK', 'Tokelau', 'oceania'],
  ['TL', 'Timor oriental', 'asia'],
  ['TM', 'Turkménistan', 'asia'],
  ['TN', 'Tunisie', 'africa'],
  ['TO', 'Tonga', 'oceania'],
  ['TR', 'Turquie', 'europe'],
  ['TT', 'Trinité-et-Tobago', 'central_america'],
  ['TV', 'Tuvalu', 'oceania'],
  ['TW', 'Taïwan', 'asia'],
  ['TZ', 'Tanzanie', 'africa'],
  ['UA', 'Ukraine', 'europe'],
  ['UG', 'Ouganda', 'africa'],
  ['UM', 'Îles mineures éloignées des États-Unis', 'oceania'],
  ['US', 'États-Unis', 'north_america'],
  ['UY', 'Uruguay', 'south_america'],
  ['UZ', 'Ouzbékistan', 'asia'],
  ['VA', 'Vatican', 'europe'],
  ['VC', 'Saint-Vincent-et-les-Grenadines', 'central_america'],
  ['VE', 'Venezuela', 'south_america'],
  ['VG', 'Îles Vierges britanniques', 'central_america'],
  ['VI', 'Îles Vierges des États-Unis', 'central_america'],
  ['VN', 'Viêt Nam', 'asia'],
  ['VU', 'Vanuatu', 'oceania'],
  ['WF', 'Wallis-et-Futuna', 'oceania'],
  ['WS', 'Samoa', 'oceania'],
  ['XK', 'Kosovo', 'europe'],
  ['YE', 'Yémen', 'asia'],
  ['YT', 'Mayotte', 'africa'],
  ['ZA', 'Afrique du Sud', 'africa'],
  ['ZM', 'Zambie', 'africa'],
  ['ZW', 'Zimbabwe', 'africa'],
];

export const WORLD_COUNTRIES: readonly WorldCountry[] = COUNTRY_ROWS.map(
  ([iso2, nameFr, zone]) => ({ iso2, nameFr, zone })
);

const FRENCH_TERRITORY_SET: ReadonlySet<string> = new Set(FRENCH_TERRITORY_CODES);

/** Pays International, groupés comme les continents du second menu (hors France et assimilés). */
export const INTERNATIONAL_COUNTRY_SECTIONS: readonly GeoCountryMenuSection[] =
  WORLD_ZONE_CONTINENTS.map((zone) => ({
    title: WORLD_ZONE_LABEL[zone],
    rows: WORLD_COUNTRIES.filter(
      (row) => row.zone === zone && !FRENCH_TERRITORY_SET.has(row.iso2)
    )
      .map((row) => ({ iso2: row.iso2, label: row.nameFr }))
      .sort((a, b) => compareFrenchCountryLabel(a.label, b.label)),
  })).filter((section) => section.rows.length > 0);

const INTERNATIONAL_ISO: ReadonlySet<string> = new Set(
  INTERNATIONAL_COUNTRY_SECTIONS.flatMap((section) =>
    section.rows.map((row) => row.iso2)
  )
);

export function isInternationalMenuIso(
  countryCode: string | null | undefined
): boolean {
  if (!countryCode) return false;
  return INTERNATIONAL_ISO.has(countryCode.trim().toUpperCase());
}

export function parseInternationalCountry(raw: unknown): string | null {
  const iso = String(raw || '')
    .trim()
    .toUpperCase();
  return isInternationalMenuIso(iso) ? iso : null;
}

export function parseInternationalCountries(
  raw: unknown,
  legacySingle?: unknown
): string[] {
  const out: string[] = [];
  const add = (value: unknown) => {
    const iso = parseInternationalCountry(value);
    if (iso && !out.includes(iso)) out.push(iso);
  };
  if (Array.isArray(raw)) raw.forEach(add);
  else add(raw);
  if (out.length === 0) add(legacySingle);
  return out;
}

export function internationalCountryLabel(
  countryCode: string | null | undefined
): string {
  if (!countryCode) return '';
  const iso = countryCode.trim().toUpperCase();
  for (const section of INTERNATIONAL_COUNTRY_SECTIONS) {
    const row = section.rows.find((item) => item.iso2 === iso);
    if (row) return row.label;
  }
  return '';
}

const COUNTRY_BY_ISO = new Map(
  WORLD_COUNTRIES.map((row) => [row.iso2, row] as const)
);

export function isWorldZone(value: string): value is WorldZone {
  return (
    value === 'europe' ||
    value === 'north_america' ||
    value === 'central_america' ||
    value === 'south_america' ||
    value === 'africa' ||
    value === 'asia' ||
    value === 'oceania'
  );
}

export function isWorldZoneFilter(value: string): value is WorldZoneFilter {
  return value === 'worldwide' || isWorldZone(value);
}

export function countryToWorldZone(
  countryCode: string | null | undefined
): WorldZone | null {
  if (!countryCode) return null;
  return COUNTRY_BY_ISO.get(countryCode.trim().toUpperCase())?.zone ?? null;
}

export function countryNameFr(
  countryCode: string | null | undefined
): string {
  if (!countryCode) return '';
  return COUNTRY_BY_ISO.get(countryCode.trim().toUpperCase())?.nameFr ?? '';
}

export function worldZoneLabel(
  zone: string | null | undefined
): string {
  if (!zone) return '';
  if (isWorldZoneFilter(zone)) return WORLD_ZONE_LABEL[zone];
  return '';
}

/** Ville affichable : city_name, sinon texte avant « (CP) ». */
export function declaredCityName(
  cityName?: string | null,
  location?: string | null
): string {
  const fromCol = (cityName || '').trim();
  if (fromCol) return fromCol;
  const loc = (location || '').trim();
  if (!loc) return '';
  return loc.replace(/\s*\(.*$/, '').trim() || loc;
}

export type InternationalGeoFacts = {
  continent: string;
  country: string;
  city: string;
  distanceLabel: string;
};

/**
 * Quatre champs toujours renseignés pour une fiche International
 * (nbsp si une valeur manque, pour garder les 4 lignes visibles).
 */
export function formatInternationalGeoFacts(input: {
  worldZone?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  cityName?: string | null;
  location?: string | null;
  distanceKm?: number | null;
}): InternationalGeoFacts {
  const zone =
    (input.worldZone && isWorldZone(input.worldZone)
      ? input.worldZone
      : countryToWorldZone(input.countryCode)) ?? null;
  const continent = worldZoneLabel(zone) || '\u00a0';
  const country =
    (input.countryName || '').trim() ||
    countryNameFr(input.countryCode) ||
    (input.countryCode || '').trim() ||
    '\u00a0';
  const city = declaredCityName(input.cityName, input.location) || '\u00a0';
  let distanceLabel = '\u00a0';
  if (
    typeof input.distanceKm === 'number' &&
    Number.isFinite(input.distanceKm) &&
    input.distanceKm >= 0
  ) {
    distanceLabel = `à ${Math.max(1, Math.round(input.distanceKm))} km`;
  }
  return { continent, country, city, distanceLabel };
}
