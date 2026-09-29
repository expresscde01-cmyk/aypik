import { placeHomeSuggestions } from '@/lib/boostPlacement';
import { inclusiveGeoGroupRank } from '@/lib/discoverySort';
import { supabase } from '@/lib/supabase';
import type { Profile, ProfileGender } from '@/components/ProfileSetup';
import { geoProximityFlags } from '@/lib/geoProximity';
import {
  BOOSTED_CANDIDATE_LIMIT,
  isMissingBoostedRpc,
  mapSuggestRow,
  suggestProfilesRpcArgs,
  type SuggestRow,
} from '@/lib/discoveryCatalog';
import { ensureProfileCoordinates } from '@/lib/profileCoordinates';
import { candidatePassesGeoFilter, fillMissingProfileDistances } from '@/lib/suggestionMatch';
import {
  DEFAULT_SUGGESTION_PREFS,
  type SuggestionPrefs,
} from '@/lib/suggestionPrefs';

export { displaySocialNotification } from '@/lib/interactionCopy';

export type SocialNotificationKind =
  | 'flash_received'
  | 'like_received'
  | 'match_created'
  | 'message_received'
  | 'match_waiting'
  | 'match_declined'
  | 'match_wait_reminder'
  | 'match_wait_expiry';

export type SocialNotification = {
  id: string;
  user_id: string;
  kind: SocialNotificationKind;
  title: string;
  body: string;
  actor_id: string | null;
  flash_id: string | null;
  action_type?: string | null;
  interaction_type?: string | null;
  source?: string | null;
  origin?: string | null;
  read_at: string | null;
  email_sent_at: string | null;
  created_at: string;
};

export async function fetchSocialNotifications(
  limit = 30
): Promise<SocialNotification[]> {
  const { data, error } = await supabase.rpc('get_my_social_notifications', {
    p_limit: limit,
  });
  if (error) throw error;
  return (data || []) as SocialNotification[];
}

export async function countUnreadSocialNotifications(): Promise<number> {
  const { data, error } = await supabase.rpc(
    'count_unread_social_notifications'
  );
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function markSocialNotificationRead(id: string): Promise<void> {
  await supabase.rpc('mark_social_notification_read', { p_id: id });
}

export async function markAllSocialNotificationsRead(): Promise<void> {
  await supabase.rpc('mark_all_social_notifications_read');
}

export async function sweepStaleSocialNotifications(
  actorId?: string | null
): Promise<void> {
  const { error } = await supabase.rpc('sweep_stale_social_notifications', {
    p_actor: actorId ?? null,
  });
  if (error) return;
}

/** Vitrine Accueil : shortlist qualitative, le catalogue complet est sur Découvrir. */
export const HOME_SUGGESTIONS_MAX = 8;

export type SuggestedProfile = Profile & {
  score: number;
  mutual_interest_count: number;
  same_city: boolean;
  same_department: boolean;
  same_region: boolean;
  neighboring_region: boolean;
  age: number;
  is_boosted: boolean;
  mutual_interests: string[];
  distance_km: number | null;
  is_founder?: boolean;
  founder_number?: number | null;
};

export async function fetchSuggestedProfiles(options?: {
  limit?: number;
  myInterests?: string[];
  myAge?: number;
  myLocation?: string;
  viewerGender?: ProfileGender | null;
  myLat?: number | null;
  myLng?: number | null;
  prefs?: SuggestionPrefs;
  excludeLikedAndFlashed?: boolean;
  signal?: AbortSignal;
}): Promise<SuggestedProfile[]> {
  const myAge = options?.myAge;
  if (typeof myAge !== 'number' || !Number.isFinite(myAge)) {
    return [];
  }

  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return [];
  if (options?.signal?.aborted) return [];

  const prefs = options?.prefs ?? DEFAULT_SUGGESTION_PREFS;
  const myInterests = options?.myInterests || [];

  await ensureProfileCoordinates({
    id: me,
    location: options?.myLocation,
    lat: options?.myLat,
    lng: options?.myLng,
  });
  if (options?.signal?.aborted) return [];

  const rpcArgs = suggestProfilesRpcArgs({
    limit: 50,
    minOverlap: prefs.minOverlap,
    mode: 'home',
    geoPerimeter: prefs.geoPerimeter,
    geoExclusive: prefs.geoExclusive,
    radiusKm: prefs.geoRadiusKm,
    sort: 'score',
    worldZones: prefs.worldZones,
    internationalCountries: prefs.internationalCountries,
    franceWorldChoice: prefs.franceWorldChoice,
    franceWorldCodes: prefs.franceWorldCodes,
    temperamentFilter: prefs.temperamentFilter,
    languageCodes: prefs.languageCodes,
    minLanguageLevel: prefs.minLanguageLevel,
  });

  const load = async (args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc('suggest_profiles', args);
    if (options?.signal?.aborted) return [];
    if (error) throw error;
    const mapped = ((data || []) as SuggestRow[])
      .map((row) => {
        const mappedRow = mapSuggestRow(
          row,
          myInterests,
          options?.myLocation
        );
        return {
          ...mappedRow,
          mutual_interest_count: mappedRow.mutual_interests.length,
        };
      })
      .filter((candidate) =>
        candidatePassesGeoFilter(candidate, prefs, options?.myLocation)
      );
    return fillMissingProfileDistances(
      options?.myLocation,
      mapped,
      options?.signal
    );
  };

  const withDistance = await load(rpcArgs);
  let boosted = withDistance.filter((candidate) => candidate.is_boosted);
  try {
    const extra = await load({
      ...rpcArgs,
      p_limit: BOOSTED_CANDIDATE_LIMIT,
      p_boosted_only: true,
    });
    if (extra.length > 0) boosted = extra;
  } catch (error) {
    if (
      !isMissingBoostedRpc(error as { code?: string; message?: string } | null)
    ) {
      throw error;
    }
  }
  const ordered =
    prefs.geoPerimeter === 'international' ||
    prefs.geoPerimeter === 'la_france_dans_le_monde'
      ? withDistance.slice().sort(
          (a, b) =>
            inclusiveGeoGroupRank(a) - inclusiveGeoGroupRank(b) ||
            (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9)
        )
      : withDistance;
  return placeHomeSuggestions(
    ordered,
    me,
    Date.now(),
    HOME_SUGGESTIONS_MAX,
    boosted
  );
}

/** Affinité géographique à partir des libellés « Ville (CP) » (sans lat/lng). */
export function cityAffinityScore(a: string, b: string): number {
  if (!a?.trim() || !b?.trim()) return 0;
  if (a.trim() === b.trim()) return 100;

  const flags = geoProximityFlags(a, b);
  const parsedA = a.trim().match(/\((\d{5})/);
  const parsedB = b.trim().match(/\((\d{5})/);
  if (parsedA && parsedB && parsedA[1] === parsedB[1]) return 90;
  if (flags.same_city) return 80;
  if (flags.same_department) return 50;
  if (flags.same_region) return 25;
  if (flags.neighboring_region) return 12;
  return 0;
}

export function rankProfileScore(params: {
  myAge: number;
  theirAge: number;
  myLocation: string;
  theirLocation: string;
  mutualInterestCount: number;
  isBoosted?: boolean;
}): number {
  const ageProximity = Math.max(0, 20 - Math.abs(params.myAge - params.theirAge));
  const city = cityAffinityScore(params.myLocation, params.theirLocation);
  const cityPoints =
    city >= 100
      ? 35
      : city >= 80
        ? 28
        : city >= 50
          ? 15
          : city >= 25
            ? 8
            : city >= 12
              ? 4
              : 0;
  return (
    params.mutualInterestCount * 40 +
    cityPoints +
    ageProximity +
    (params.isBoosted ? 25 : 0)
  );
}
