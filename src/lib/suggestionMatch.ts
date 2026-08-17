import {
  isWithinAgeGap,
  parseProfileGender,
  MIN_USER_AGE,
  type ProfileGender,
} from '@/lib/dating';
import {
  discoveryLocationBadge,
  matchesGeoPerimeter,
  type GeoProximityFlags,
} from '@/lib/geoProximity';
import {
  distanceKmBetween,
  lookupLocationCentre,
  lookupLocationCentres,
} from '@/lib/geoCommunes';
import type { SuggestionPrefs } from '@/lib/suggestionPrefs';

export type DistanceProfile = GeoProximityFlags & {
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

export function suggestionGeoBadge(
  flags: Partial<GeoProximityFlags> | null | undefined,
  distanceKm: number | null | undefined,
  _prefs?: SuggestionPrefs
): string | null {
  return discoveryLocationBadge(flags, distanceKm);
}

export type SearchCandidate = {
  gender?: string | null;
  age: number;
  mutualCount: number;
  flags: Partial<GeoProximityFlags>;
  distanceKm: number | null;
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

export function passesSuggestionPillars(
  candidate: SearchCandidate,
  myAge: number,
  targetGender: ProfileGender | null,
  prefs: SuggestionPrefs
): boolean {
  return passesSearchCriteria(candidate, myAge, targetGender, prefs);
}
