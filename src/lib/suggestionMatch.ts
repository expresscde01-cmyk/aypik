import {
  isWithinAgeGap,
  parseProfileGender,
  MIN_USER_AGE,
  type ProfileGender,
} from '@/lib/dating';
import {
  profileCardGeoBadge,
  matchesGeoPerimeter,
  geoExclusiveApplies,
  type GeoProximityFlags,
} from '@/lib/geoProximity';
import {
  distanceKmBetween,
  lookupLocationCentre,
  lookupLocationCentres,
} from '@/lib/geoCommunes';
import type { SuggestionPrefs } from '@/lib/suggestionPrefs';

export type DistanceProfile = {
  id: string;
  location?: string | null;
};

export async function resolveProfileDistances(
  myLocation: string,
  profiles: DistanceProfile[],
  _prefs?: SuggestionPrefs,
  signal?: AbortSignal
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  const locationsNeeded = new Set<string>();

  for (const profile of profiles) {
    const loc = String(profile.location || '').trim();
    if (loc) locationsNeeded.add(loc);
  }

  if (locationsNeeded.size === 0) return map;

  const myPoint = await lookupLocationCentre(myLocation, signal);
  if (!myPoint) return map;

  const centres = await lookupLocationCentres([...locationsNeeded], signal);
  for (const profile of profiles) {
    const loc = String(profile.location || '').trim();
    const theirPoint = loc ? centres.get(loc) ?? null : null;
    map.set(
      profile.id,
      theirPoint ? distanceKmBetween(myPoint, theirPoint) : null
    );
  }
  return map;
}

export async function fillMissingProfileDistances<
  T extends { id: string; location?: string | null; distance_km: number | null },
>(
  myLocation: string | null | undefined,
  candidates: T[],
  signal?: AbortSignal
): Promise<T[]> {
  if (!myLocation?.trim() || candidates.length === 0) return candidates;
  const missing = candidates.filter((candidate) => {
    const km = candidate.distance_km;
    if (typeof km === 'number' && Number.isFinite(km) && km >= 0) return false;
    return Boolean(String(candidate.location || '').trim());
  });
  if (missing.length === 0) return candidates;
  const map = await resolveProfileDistances(
    myLocation,
    missing,
    undefined,
    signal
  );
  if (map.size === 0) return candidates;
  return candidates.map((candidate) => {
    const next = map.get(candidate.id);
    if (typeof next !== 'number' || !Number.isFinite(next) || next < 0) {
      return candidate;
    }
    return { ...candidate, distance_km: next };
  });
}

export function suggestionGeoBadge(
  flags: Partial<GeoProximityFlags> | null | undefined,
  _distanceKm?: number | null | undefined,
  prefs?: SuggestionPrefs,
  location?: string | null
): string | null {
  return profileCardGeoBadge(flags, location, prefs?.geoPerimeter);
}

export type SearchCandidate = {
  gender?: string | null;
  age: number;
  mutualCount: number;
  flags: Partial<GeoProximityFlags>;
  distanceKm: number | null;
  location?: string | null;
};

/**
 * Moteur Découvrir / Accueil : 3 conditions cumulatives (ET).
 * 1. Géographie (périmètre choisi)
 * 2. Âge : floor(âge utilisateur / 2) + 7 ≤ âge du profil
 * 3. Centres d’intérêt (minimum sélectionné)
 * Genre homme→femmes / femme→hommes : éligibilité, hors menus.
 */
export function passesSearchCriteria(
  candidate: SearchCandidate,
  myAge: number,
  targetGender: ProfileGender | null,
  prefs: SuggestionPrefs
): boolean {
  if (!Number.isFinite(myAge) || !Number.isFinite(candidate.age)) return false;
  if (myAge < MIN_USER_AGE || candidate.age < MIN_USER_AGE) return false;
  if (targetGender && parseProfileGender(candidate.gender) !== targetGender) {
    return false;
  }

  if (
    !matchesGeoPerimeter(candidate.flags, prefs.geoPerimeter, {
      distanceKm: candidate.distanceKm,
      radiusKm: prefs.geoRadiusKm,
      location: candidate.location,
      exclusive:
        Boolean(prefs.geoExclusive) &&
        geoExclusiveApplies(prefs.geoPerimeter),
    })
  ) {
    return false;
  }

  if (!isWithinAgeGap(myAge, candidate.age)) return false;

  if (prefs.minOverlap > 0 && candidate.mutualCount < prefs.minOverlap) {
    return false;
  }

  return true;
}

/** Filet client : strate + exclusif, même si le SQL déployé est en retard. */
export function candidatePassesGeoFilter(
  candidate: {
    same_city?: boolean;
    same_department?: boolean;
    same_region?: boolean;
    neighboring_region?: boolean;
    location?: string | null;
    distance_km?: number | null;
  },
  prefs: SuggestionPrefs,
  viewerLocation?: string | null
): boolean {
  return matchesGeoPerimeter(candidate, prefs.geoPerimeter, {
    distanceKm: candidate.distance_km,
    radiusKm: prefs.geoRadiusKm,
    location: candidate.location,
    viewerLocation,
    exclusive:
      Boolean(prefs.geoExclusive) && geoExclusiveApplies(prefs.geoPerimeter),
  });
}

export function passesSuggestionPillars(
  candidate: SearchCandidate,
  myAge: number,
  targetGender: ProfileGender | null,
  prefs: SuggestionPrefs
): boolean {
  return passesSearchCriteria(candidate, myAge, targetGender, prefs);
}
