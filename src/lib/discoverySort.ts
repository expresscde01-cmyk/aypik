import {
  geoProximityLevelFromFlags,
  macroZoneFromLocation,
  type GeoProximityFlags,
} from '@/lib/geoProximity';

/** Fenêtre « Nouveaux profils » selon le nombre total d’inscriptions. */
export function newProfilesWindowMonths(signupCount: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (!Number.isFinite(signupCount) || signupCount < 500) return 6;
  if (signupCount < 1000) return 5;
  if (signupCount < 2000) return 4;
  if (signupCount < 5000) return 3;
  if (signupCount < 10000) return 2;
  return 1;
}

export function newProfilesSortHint(_months: number): string {
  return 'Du plus récent au plus ancien sur les 6 derniers mois';
}

export function newProfilesCutoffMs(
  months: number,
  now = Date.now()
): number {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d.getTime();
}

/** ISO stable (jour UTC) pour la clé React Query — pas Date.now() à chaque rendu. */
export function newProfilesCutoffIso(months: number): string {
  const d = new Date(newProfilesCutoffMs(months));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function isWithinNewProfilesWindow(
  createdAt: string | undefined,
  cutoffMs: number
): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= cutoffMs;
}

export const ACTIFS_SORT_HINT = 'Classement des profils par activité';
export const DISTANCE_SORT_HINT = 'Du plus proche au plus éloigné';
export const INTERESTS_SORT_HINT = 'Du plus au moins d’affinités';

export type DiscoverySortChoice =
  | 'nouveaux'
  | 'distance'
  | 'interests'
  | 'actifs';

type SortableCandidate = {
  created_at?: string;
  updated_at?: string;
  last_active_at?: string | null;
  distance_km: number | null;
  mutual_interests: string[];
  activity_score?: number;
};

function createdAtMs(c: SortableCandidate): number {
  return c.created_at ? Date.parse(c.created_at) : 0;
}

function distanceKm(c: SortableCandidate): number {
  return typeof c.distance_km === 'number' && Number.isFinite(c.distance_km)
    ? c.distance_km
    : Number.POSITIVE_INFINITY;
}

function mutualCount(c: SortableCandidate): number {
  return c.mutual_interests.length;
}

function activeAtMs(c: SortableCandidate): number {
  const raw = c.last_active_at || c.updated_at || c.created_at;
  return raw ? Date.parse(raw) || 0 : 0;
}

/** Tri Découvrir : résultat stable tant que les deps (liste, tri, fenêtre) ne changent pas. */
export function sortDiscoveryCandidates<T extends SortableCandidate>(
  candidates: T[],
  sortChoice: DiscoverySortChoice,
  newMonths: number
): T[] {
  const cutoffMs = newProfilesCutoffMs(newMonths);
  const source =
    sortChoice === 'nouveaux'
      ? candidates.filter((c) => isWithinNewProfilesWindow(c.created_at, cutoffMs))
      : candidates;
  const list = source.slice();

  if (sortChoice === 'distance') {
    list.sort(
      (a, b) =>
        distanceKm(a) - distanceKm(b) ||
        mutualCount(b) - mutualCount(a) ||
        createdAtMs(b) - createdAtMs(a)
    );
  } else if (sortChoice === 'interests') {
    list.sort(
      (a, b) =>
        mutualCount(b) - mutualCount(a) ||
        distanceKm(a) - distanceKm(b) ||
        createdAtMs(b) - createdAtMs(a)
    );
  } else if (sortChoice === 'actifs') {
    list.sort(
      (a, b) =>
        activeAtMs(b) - activeAtMs(a) ||
        (b.activity_score ?? 0) - (a.activity_score ?? 0) ||
        createdAtMs(b) - createdAtMs(a)
    );
  } else {
    list.sort(
      (a, b) => createdAtMs(b) - createdAtMs(a) || mutualCount(b) - mutualCount(a)
    );
  }
  return list;
}

type GeoSortableCandidate = GeoProximityFlags & {
  location?: string | null;
  distance_km: number | null;
};

/**
 * Résultat des filtres Découvrir (toggle « Trier par » OFF) :
 * Même ville → département → région → régions voisines → quarts de France,
 * et dans chaque groupe du plus proche au plus loin.
 */
function filterGeoGroupRank(c: GeoSortableCandidate): number {
  const level = geoProximityLevelFromFlags(c);
  if (level === 'city') return 1;
  if (level === 'department') return 2;
  if (level === 'region') return 3;
  if (level === 'neighboring_region') return 4;
  if (macroZoneFromLocation(c.location)) return 5;
  return 6;
}

export function sortDiscoveryFilterResults<T extends GeoSortableCandidate>(
  candidates: T[]
): T[] {
  return candidates.slice().sort(
    (a, b) =>
      filterGeoGroupRank(a) - filterGeoGroupRank(b) ||
      distanceKm(a) - distanceKm(b)
  );
}
