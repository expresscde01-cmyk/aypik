/**
 * Proximité géographique Aypik (libellés « Ville (CP) », sans lat/lng).
 * Miroir TypeScript des tables SQL department_regions + region_neighbors
 * (migration 20260813220000) — garder les deux alignés.
 *
 * Hiérarchie (le plus proche gagne, un seul badge) :
 * 1. Même ville  2. Même département  3. Même région  4. Région voisine
 */

export type GeoProximityLevel =
  | 'city'
  | 'department'
  | 'region'
  | 'neighboring_region';

export const GEO_PROXIMITY_LABEL: Record<GeoProximityLevel, string> = {
  city: 'Même ville',
  department: 'Même département',
  region: 'Même région',
  neighboring_region: 'Région voisine',
};

export const REGION_IDF = 'Île-de-France';
export const REGION_HDF = 'Hauts-de-France';
export const REGION_GE = 'Grand Est';
export const REGION_BFC = 'Bourgogne-Franche-Comté';
export const REGION_CVL = 'Centre-Val de Loire';
export const REGION_NOR = 'Normandie';
export const REGION_BRE = 'Bretagne';
export const REGION_PDL = 'Pays de la Loire';
export const REGION_NAQ = 'Nouvelle-Aquitaine';
export const REGION_OCC = 'Occitanie';
export const REGION_ARA = 'Auvergne-Rhône-Alpes';
export const REGION_PAC = "Provence-Alpes-Côte d'Azur";
export const REGION_COR = 'Corse';

/** Département (2 chiffres, 20/2A/2B, ou 3 chiffres DOM-TOM) → région. */
export const DEPT_TO_REGION: Record<string, string> = {
  '75': REGION_IDF,
  '77': REGION_IDF,
  '78': REGION_IDF,
  '91': REGION_IDF,
  '92': REGION_IDF,
  '93': REGION_IDF,
  '94': REGION_IDF,
  '95': REGION_IDF,
  '02': REGION_HDF,
  '59': REGION_HDF,
  '60': REGION_HDF,
  '62': REGION_HDF,
  '80': REGION_HDF,
  '08': REGION_GE,
  '10': REGION_GE,
  '51': REGION_GE,
  '52': REGION_GE,
  '54': REGION_GE,
  '55': REGION_GE,
  '57': REGION_GE,
  '67': REGION_GE,
  '68': REGION_GE,
  '88': REGION_GE,
  '21': REGION_BFC,
  '25': REGION_BFC,
  '39': REGION_BFC,
  '58': REGION_BFC,
  '70': REGION_BFC,
  '71': REGION_BFC,
  '89': REGION_BFC,
  '90': REGION_BFC,
  '18': REGION_CVL,
  '28': REGION_CVL,
  '36': REGION_CVL,
  '37': REGION_CVL,
  '41': REGION_CVL,
  '45': REGION_CVL,
  '14': REGION_NOR,
  '27': REGION_NOR,
  '50': REGION_NOR,
  '61': REGION_NOR,
  '76': REGION_NOR,
  '22': REGION_BRE,
  '29': REGION_BRE,
  '35': REGION_BRE,
  '56': REGION_BRE,
  '44': REGION_PDL,
  '49': REGION_PDL,
  '53': REGION_PDL,
  '72': REGION_PDL,
  '85': REGION_PDL,
  '16': REGION_NAQ,
  '17': REGION_NAQ,
  '19': REGION_NAQ,
  '23': REGION_NAQ,
  '24': REGION_NAQ,
  '33': REGION_NAQ,
  '40': REGION_NAQ,
  '47': REGION_NAQ,
  '64': REGION_NAQ,
  '79': REGION_NAQ,
  '86': REGION_NAQ,
  '87': REGION_NAQ,
  '09': REGION_OCC,
  '11': REGION_OCC,
  '12': REGION_OCC,
  '30': REGION_OCC,
  '31': REGION_OCC,
  '32': REGION_OCC,
  '34': REGION_OCC,
  '46': REGION_OCC,
  '48': REGION_OCC,
  '65': REGION_OCC,
  '66': REGION_OCC,
  '81': REGION_OCC,
  '82': REGION_OCC,
  '01': REGION_ARA,
  '03': REGION_ARA,
  '07': REGION_ARA,
  '15': REGION_ARA,
  '26': REGION_ARA,
  '38': REGION_ARA,
  '42': REGION_ARA,
  '43': REGION_ARA,
  '63': REGION_ARA,
  '69': REGION_ARA,
  '73': REGION_ARA,
  '74': REGION_ARA,
  '04': REGION_PAC,
  '05': REGION_PAC,
  '06': REGION_PAC,
  '13': REGION_PAC,
  '83': REGION_PAC,
  '84': REGION_PAC,
  '20': REGION_COR,
  '2A': REGION_COR,
  '2B': REGION_COR,
  '2a': REGION_COR,
  '2b': REGION_COR,
  '971': 'Guadeloupe',
  '972': 'Martinique',
  '973': 'Guyane',
  '974': 'La Réunion',
  '975': 'Saint-Pierre-et-Miquelon',
  '976': 'Mayotte',
  '977': 'Saint-Barthélemy',
  '978': 'Saint-Martin',
  '984': 'Terres australes',
  '986': 'Wallis-et-Futuna',
  '987': 'Polynésie française',
  '988': 'Nouvelle-Calédonie',
};

/**
 * Adjacence terrestre métropole (bidirectionnelle).
 * Corse et DOM-TOM : aucune voisine (pas de lien mer avec PACA).
 */
export const REGION_NEIGHBORS: Record<string, readonly string[]> = {
  [REGION_IDF]: [REGION_HDF, REGION_GE, REGION_BFC, REGION_CVL, REGION_NOR],
  [REGION_HDF]: [REGION_IDF, REGION_GE, REGION_NOR],
  [REGION_GE]: [REGION_HDF, REGION_IDF, REGION_BFC],
  [REGION_BFC]: [REGION_GE, REGION_IDF, REGION_CVL, REGION_ARA],
  [REGION_CVL]: [
    REGION_IDF,
    REGION_NOR,
    REGION_PDL,
    REGION_NAQ,
    REGION_ARA,
    REGION_BFC,
  ],
  [REGION_NOR]: [REGION_HDF, REGION_IDF, REGION_CVL, REGION_PDL, REGION_BRE],
  [REGION_BRE]: [REGION_NOR, REGION_PDL],
  [REGION_PDL]: [REGION_BRE, REGION_NOR, REGION_CVL, REGION_NAQ],
  [REGION_NAQ]: [REGION_PDL, REGION_CVL, REGION_ARA, REGION_OCC],
  [REGION_OCC]: [REGION_NAQ, REGION_ARA, REGION_PAC],
  [REGION_ARA]: [REGION_CVL, REGION_BFC, REGION_NAQ, REGION_OCC, REGION_PAC],
  [REGION_PAC]: [REGION_ARA, REGION_OCC],
  [REGION_COR]: [],
};

export type ParsedLocation = {
  name: string;
  cp: string;
  dept: string;
};

/** Code département depuis un CP à 5 chiffres (97x/98x → 3 chiffres, Corse → 20). */
export function deptCodeFromPostal(cp: string): string {
  if (cp.startsWith('97') || cp.startsWith('98')) return cp.slice(0, 3);
  return cp.slice(0, 2);
}

export function parseLocation(loc: string): ParsedLocation {
  const trimmed = loc.trim();
  const range = trimmed.match(/^(.+?)\s*\((\d{5})/);
  if (range) {
    const cp = range[2];
    return {
      name: normalizeCityName(range[1]),
      cp,
      dept: deptCodeFromPostal(cp),
    };
  }
  const anyCp = trimmed.match(/\b(\d{5})\b/);
  if (anyCp) {
    const cp = anyCp[1];
    const name = normalizeCityName(trimmed.replace(anyCp[0], ''));
    return { name, cp, dept: deptCodeFromPostal(cp) };
  }
  return { name: normalizeCityName(trimmed), cp: '', dept: '' };
}

function normalizeCityName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function regionFromDept(dept: string): string | null {
  if (!dept) return null;
  return DEPT_TO_REGION[dept] ?? null;
}

export function regionsAreNeighbors(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  return Boolean(REGION_NEIGHBORS[a]?.includes(b));
}

export type GeoProximityFlags = {
  same_city: boolean;
  same_department: boolean;
  same_region: boolean;
  neighboring_region: boolean;
};

export function geoProximityFlags(a: string, b: string): GeoProximityFlags {
  const empty: GeoProximityFlags = {
    same_city: false,
    same_department: false,
    same_region: false,
    neighboring_region: false,
  };
  if (!a?.trim() || !b?.trim()) return empty;

  const A = parseLocation(a);
  const B = parseLocation(b);
  const sameDept = Boolean(A.dept && B.dept && A.dept === B.dept);
  const sameName = Boolean(A.name && B.name && A.name === B.name);
  // Homonymes (Montreuil 93 vs 28) : le CP tranche. Sans CP, le nom suffit.
  const sameCity =
    a.trim() === b.trim() ||
    (sameName && (!A.dept || !B.dept || A.dept === B.dept));
  const regionA = regionFromDept(A.dept);
  const regionB = regionFromDept(B.dept);
  const sameRegion = Boolean(
    (regionA && regionB && regionA === regionB) || sameDept
  );
  const neighboring =
    Boolean(regionA && regionB) &&
    !sameRegion &&
    regionsAreNeighbors(regionA as string, regionB as string);

  return {
    same_city: sameCity,
    same_department: sameDept,
    same_region: sameRegion || sameDept,
    neighboring_region: neighboring,
  };
}

export function geoProximityLevelFromFlags(
  flags: Partial<GeoProximityFlags> | null | undefined
): GeoProximityLevel | null {
  if (!flags) return null;
  if (flags.same_city) return 'city';
  if (flags.same_department) return 'department';
  if (flags.same_region) return 'region';
  if (flags.neighboring_region) return 'neighboring_region';
  return null;
}

export function geoProximityBetween(
  a: string,
  b: string
): GeoProximityLevel | null {
  return geoProximityLevelFromFlags(geoProximityFlags(a, b));
}

/** Libellé unique du badge, ou null si trop loin / indéterminé. */
export function geoProximityBadge(
  flags: Partial<GeoProximityFlags> | null | undefined
): string | null {
  const level = geoProximityLevelFromFlags(flags);
  return level ? GEO_PROXIMITY_LABEL[level] : null;
}

export function geoProximityBadgeFromLocations(
  a: string,
  b: string
): string | null {
  return geoProximityBadge(geoProximityFlags(a, b));
}

/** Filtre Découvrir : une seule option à la fois (la nouvelle remplace la précédente). */
export type GeoPerimeterFilter = 'anywhere' | GeoProximityLevel | 'radius';

/** Paliers de recherche ciblée. Sans limite geo → « Partout ». */
export const GEO_RADIUS_KM_OPTIONS = [30, 50, 100, 200, 300, 400, 500] as const;
export type GeoRadiusKm = (typeof GEO_RADIUS_KM_OPTIONS)[number];
export const GEO_RADIUS_KM_DEFAULT: GeoRadiusKm = 100;

const GEO_PERIMETER_RANK: Record<GeoProximityLevel, number> = {
  city: 1,
  department: 2,
  region: 3,
  neighboring_region: 4,
};

/** Libellés du menu Découvrir. « Jusqu’à » = le palier choisi + tous les cercles plus proches. */
export const GEO_PERIMETER_FILTER_LABEL: Record<GeoPerimeterFilter, string> = {
  anywhere: 'Partout',
  city: 'Même ville',
  department: 'Jusqu’au département',
  region: 'Jusqu’à la région',
  neighboring_region: 'Jusqu’aux régions voisines',
  radius: 'Jusqu’à un rayon de...',
};

export const GEO_PERIMETER_OPTIONS: readonly GeoPerimeterFilter[] = [
  'anywhere',
  'city',
  'department',
  'region',
  'neighboring_region',
  'radius',
];

export function geoScopeWidth(
  perimeter: GeoPerimeterFilter,
  radiusKm: number
): number {
  if (perimeter === 'anywhere') return Number.POSITIVE_INFINITY;
  if (perimeter === 'radius') return 100 + radiusKm;
  return GEO_PERIMETER_RANK[perimeter];
}

/** True si le nouveau périmètre englobe un cercle plus large que le précédent. */
export function isGeoScopeWider(
  prev: { geoPerimeter: GeoPerimeterFilter; geoRadiusKm: number },
  next: { geoPerimeter: GeoPerimeterFilter; geoRadiusKm: number }
): boolean {
  return (
    geoScopeWidth(next.geoPerimeter, next.geoRadiusKm) >
    geoScopeWidth(prev.geoPerimeter, prev.geoRadiusKm)
  );
}

export function isGeoPerimeterFilter(
  value: string
): value is GeoPerimeterFilter {
  return (GEO_PERIMETER_OPTIONS as readonly string[]).includes(value);
}

export function isGeoRadiusKm(value: number): value is GeoRadiusKm {
  return (GEO_RADIUS_KM_OPTIONS as readonly number[]).includes(value);
}

/**
 * Périmètre cumulatif progressif (ET avec âge / intérêts, pas entre options) :
 *   Même ville              → ville
 *   Jusqu’au département    → ville OU département
 *   Jusqu’à la région       → ville OU département OU région
 *   Jusqu’aux régions voisines → ville OU département OU région OU voisine
 *   Jusqu’à un rayon de...  → distance ≤ rayon (km)
 *   Partout                 → aucune barrière géographique
 */
export function matchesGeoPerimeter(
  flags: Partial<GeoProximityFlags> | null | undefined,
  perimeter: GeoPerimeterFilter,
  opts?: { distanceKm?: number | null; radiusKm?: number }
): boolean {
  if (perimeter === 'anywhere') return true;

  if (perimeter === 'radius') {
    const distanceKm = opts?.distanceKm;
    const radiusKm = opts?.radiusKm;
    if (
      typeof distanceKm === 'number' &&
      Number.isFinite(distanceKm) &&
      typeof radiusKm === 'number' &&
      Number.isFinite(radiusKm)
    ) {
      return distanceKm <= radiusKm;
    }
    return Boolean(flags?.same_city);
  }

  const city = Boolean(flags?.same_city);
  const department = Boolean(flags?.same_department);
  const region = Boolean(flags?.same_region);
  const neighboring = Boolean(flags?.neighboring_region);

  switch (perimeter) {
    case 'city':
      return city;
    case 'department':
      return city || department;
    case 'region':
      return city || department || region;
    case 'neighboring_region':
      return city || department || region || neighboring;
    default:
      return false;
  }
}

export function formatDistanceKmBadge(
  distanceKm: number | null | undefined
): string | null {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm < 0) {
    return null;
  }
  return `À ${Math.max(1, Math.round(distanceKm))} km`;
}

/**
 * Badge unique sous le nom (Découvrir / Accueil) :
 * - proximité admin (ville, département, région, région voisine) → texte sémantique
 * - au-delà (rayon / Partout hors de ces cercles) → « À X km »
 */
export function discoveryLocationBadge(
  flags: Partial<GeoProximityFlags> | null | undefined,
  distanceKm: number | null | undefined
): string | null {
  const adminBadge = geoProximityBadge(flags);
  if (adminBadge) return adminBadge;
  return formatDistanceKmBadge(distanceKm);
}
