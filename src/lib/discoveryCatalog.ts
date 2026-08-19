import { supabase } from '@/lib/supabase';
import type { Profile } from '@/components/ProfileSetup';
import { parseProfileGender } from '@/lib/dating';
import {
  geoPerimeterRpcValue,
  geoProximityFlags,
  geoProximityLevelFromFlags,
} from '@/lib/geoProximity';
import { candidatePassesGeoFilter, fillMissingProfileDistances } from '@/lib/suggestionMatch';
import type { SuggestionPrefs } from '@/lib/suggestionPrefs';
import { ensureProfileCoordinates } from '@/lib/profileCoordinates';

export const DISCOVER_CATALOG_LIMIT = 500;

export type DiscoverySortId =
  | 'nouveaux'
  | 'distance'
  | 'interests'
  | 'actifs';

/** Tri catalogue : les 4 boutons Découvrir, ou le ranking filtres (toggle OFF). */
export type DiscoveryCatalogSortId = DiscoverySortId | 'score';

export type DiscoveryCandidate = Profile & {
  age: number;
  mutual_interests: string[];
  is_boosted: boolean;
  is_founder: boolean;
  founder_number: number | null;
  score: number;
  same_city: boolean;
  same_department: boolean;
  same_region: boolean;
  neighboring_region: boolean;
  distance_km: number | null;
  created_at?: string;
  updated_at?: string;
  last_active_at?: string | null;
  activity_score?: number;
};

export type SuggestRow = {
  id: string;
  display_name: string;
  birth_date: string;
  bio: string | null;
  has_children: boolean;
  location: string | null;
  interests: string[] | null;
  photo_url: string | null;
  gender: string | null;
  created_at: string;
  updated_at: string | null;
  score: number | string | null;
  mutual_interest_count: number | null;
  same_city: boolean;
  same_department: boolean;
  same_region: boolean;
  neighboring_region: boolean;
  age: number;
  is_boosted: boolean;
  distance_km: number | string | null;
  last_active_at: string | null;
  activity_score: number | null;
  is_founder: boolean | null;
  founder_number: number | null;
};

export function mapSuggestRow(
  row: SuggestRow,
  myInterests: string[],
  myLocation?: string | null
): DiscoveryCandidate {
  const interests = row.interests || [];
  const mutual_interests = interests.filter((i) => myInterests.includes(i));
  const distanceRaw = row.distance_km;
  const distance_km =
    distanceRaw === null || distanceRaw === undefined
      ? null
      : Number(distanceRaw);
  const sqlFlags = {
    same_city: Boolean(row.same_city),
    same_department: Boolean(row.same_department),
    same_region: Boolean(row.same_region),
    neighboring_region: Boolean(row.neighboring_region),
  };
  const computed =
    myLocation && row.location
      ? geoProximityFlags(myLocation, row.location)
      : null;
  const flags =
    computed && geoProximityLevelFromFlags(computed) ? computed : sqlFlags;
  return {
    id: row.id,
    display_name: row.display_name,
    birth_date: row.birth_date,
    bio: row.bio || '',
    has_children: Boolean(row.has_children),
    location: row.location || '',
    interests,
    photo_url: row.photo_url || '',
    gender: parseProfileGender(row.gender),
    age: Number(row.age) || 0,
    mutual_interests,
    is_boosted: Boolean(row.is_boosted),
    is_founder: Boolean(row.is_founder),
    founder_number: row.founder_number ?? null,
    score: Number(row.score) || 0,
    ...flags,
    distance_km: Number.isFinite(distance_km as number) ? distance_km : null,
    created_at: row.created_at,
    updated_at: row.updated_at || undefined,
    last_active_at: row.last_active_at,
    activity_score: Number(row.activity_score) || 0,
  };
}

/**
 * Arguments PostgREST de suggest_profiles.
 * Ne pas envoyer `p_exclude_ids: []` : PostgREST ne peut pas typer un tableau
 * vide et répond PGRST202 (fonction introuvable / schema cache).
 */
export function suggestProfilesRpcArgs(options: {
  limit: number;
  minOverlap: number;
  mode: 'home' | 'discover';
  geoPerimeter: SuggestionPrefs['geoPerimeter'];
  geoExclusive?: boolean;
  radiusKm: SuggestionPrefs['geoRadiusKm'];
  sort: string;
  createdAfter?: string | null;
  excludeIds?: string[];
}): Record<string, unknown> {
  const geoReset = options.geoPerimeter === 'anywhere';
  const args: Record<string, unknown> = {
    p_limit: options.limit,
    p_same_city_only: false,
    p_min_interest_overlap: Math.max(0, options.minOverlap),
    p_mode: options.mode,
    p_geo_perimeter: geoPerimeterRpcValue(
      options.geoPerimeter,
      geoReset ? false : Boolean(options.geoExclusive)
    ),
    p_radius_km: options.radiusKm,
    p_sort: options.sort,
  };
  if (options.createdAfter) {
    args.p_created_after = options.createdAfter;
  }
  const excludeIds = (options.excludeIds || []).filter(Boolean);
  if (excludeIds.length > 0) {
    args.p_exclude_ids = excludeIds;
  }
  return args;
}

/**
 * Catalogue Découvrir : une RPC SQL paginée (plus de scan 1000).
 */
export async function fetchDiscoveryCatalog(options: {
  userId: string;
  myProfile: Profile;
  prefs: SuggestionPrefs;
  sort?: DiscoveryCatalogSortId;
  createdAfter?: string | null;
  excludeIds?: string[];
  signal?: AbortSignal;
}): Promise<DiscoveryCandidate[]> {
  const { myProfile, prefs, sort = 'score' } = options;
  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  await ensureProfileCoordinates(myProfile);
  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const rpcArgs = suggestProfilesRpcArgs({
    limit: DISCOVER_CATALOG_LIMIT,
    minOverlap: prefs.minOverlap,
    mode: 'discover',
    geoPerimeter: prefs.geoPerimeter,
    geoExclusive: prefs.geoExclusive,
    radiusKm: prefs.geoRadiusKm,
    sort,
    createdAfter: options.createdAfter,
    excludeIds: options.excludeIds,
  });
  const { data, error } = await supabase.rpc('suggest_profiles', rpcArgs);

  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  if (error) throw error;

  const mapped = ((data || []) as SuggestRow[])
    .map((row) =>
      mapSuggestRow(row, myProfile.interests || [], myProfile.location)
    )
    .filter((candidate) =>
      candidatePassesGeoFilter(candidate, prefs, myProfile.location)
    );

  return fillMissingProfileDistances(
    myProfile.location,
    mapped,
    options.signal
  );
}

export async function fetchPlatformSignupCount(): Promise<number> {
  const { data, error } = await supabase.rpc('platform_signup_count');
  if (!error && typeof data === 'number' && Number.isFinite(data)) {
    return data;
  }
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .is('deletion_requested_at', null);
  return typeof count === 'number' ? count : 0;
}
