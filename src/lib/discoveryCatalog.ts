import { supabase } from '@/lib/supabase';
import type { Profile } from '@/components/ProfileSetup';
import {
  ageFromBirthDate,
  latestBirthDateForAge,
  matchingTargetGender,
  minPartnerAge,
  parseProfileGender,
  MIN_USER_AGE,
} from '@/lib/dating';
import { geoProximityFlags } from '@/lib/geoProximity';
import { rankProfileScore } from '@/lib/suggestions';
import {
  passesSearchCriteria,
  resolveProfileDistances,
  suggestionGeoBadge,
} from '@/lib/suggestionMatch';
import type { SuggestionPrefs } from '@/lib/suggestionPrefs';

const PROFILE_COLUMNS =
  'id, display_name, birth_date, bio, has_children, location, interests, photo_url, gender, created_at';

const PAGE_SIZE = 1000;
const BADGE_CHUNK = 80;

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
  geo_badge: string | null;
  created_at?: string;
};

/**
 * Catalogue Découvrir : charge les profils éligibles, puis applique
 * géographie ET âge ET intérêts (voir passesSearchCriteria).
 */
export async function fetchDiscoveryCatalog(options: {
  userId: string;
  myProfile: Profile;
  prefs: SuggestionPrefs;
  signal?: AbortSignal;
}): Promise<DiscoveryCandidate[]> {
  const { userId, myProfile, prefs, signal } = options;
  const myAge = ageFromBirthDate(myProfile.birth_date);
  const targetGender = matchingTargetGender(myProfile.gender);
  const myMinAge = Math.max(MIN_USER_AGE, minPartnerAge(myAge));

  const rows = await fetchAllEligibleProfiles({
    userId,
    minBirthDate: latestBirthDateForAge(myMinAge),
    signal,
  });

  const ids = rows.map((p) => p.id);
  const { boostSet, founderMap } = await fetchBadgeMaps(ids);

  const mapped = rows.map((profile) => {
    const age = ageFromBirthDate(profile.birth_date);
    const mutual_interests = (profile.interests || []).filter((i) =>
      (myProfile.interests || []).includes(i)
    );
    const is_boosted = boostSet.has(profile.id);
    const flags = geoProximityFlags(
      myProfile.location || '',
      profile.location || ''
    );
    return {
      ...profile,
      gender: parseProfileGender(profile.gender),
      age,
      mutual_interests,
      is_boosted,
      is_founder: founderMap.has(profile.id),
      founder_number: founderMap.get(profile.id) ?? null,
      same_city: flags.same_city,
      same_department: flags.same_department,
      same_region: flags.same_region,
      neighboring_region: flags.neighboring_region,
      created_at:
        typeof (profile as { created_at?: string }).created_at === 'string'
          ? (profile as { created_at?: string }).created_at
          : undefined,
      score: rankProfileScore({
        myAge,
        theirAge: age,
        myLocation: myProfile.location || '',
        theirLocation: profile.location || '',
        mutualInterestCount: mutual_interests.length,
        isBoosted: is_boosted,
      }),
    };
  });

  const distanceById = await resolveProfileDistances(
    myProfile.location || '',
    mapped,
    prefs,
    signal
  );

  if (signal?.aborted) return [];

  return mapped
    .map((c) => {
      const distance_km = distanceById.get(c.id) ?? null;
      return {
        ...c,
        distance_km,
        geo_badge: suggestionGeoBadge(c, distance_km, prefs),
      };
    })
    .filter((c) =>
      passesSearchCriteria(
        {
          gender: c.gender,
          age: c.age,
          mutualCount: c.mutual_interests.length,
          flags: c,
          distanceKm: c.distance_km,
        },
        myAge,
        targetGender,
        prefs
      )
    )
    .sort(
      (a, b) => b.score - a.score || Number(b.is_boosted) - Number(a.is_boosted)
    );
}

async function fetchAllEligibleProfiles(options: {
  userId: string;
  minBirthDate: string;
  signal?: AbortSignal;
}): Promise<Profile[]> {
  const data: Profile[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    if (options.signal?.aborted) return [];
    const { data: page, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .neq('id', options.userId)
      .eq('has_children', false)
      .is('deletion_requested_at', null)
      .lte('birth_date', options.minBirthDate)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const rows = (page || []) as Profile[];
    data.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return data;
}

async function fetchBadgeMaps(ids: string[]): Promise<{
  boostSet: Set<string>;
  founderMap: Map<string, number | null>;
}> {
  const boostSet = new Set<string>();
  const founderMap = new Map<string, number | null>();
  if (ids.length === 0) return { boostSet, founderMap };

  try {
    for (let i = 0; i < ids.length; i += BADGE_CHUNK) {
      const chunk = ids.slice(i, i + BADGE_CHUNK);
      const [{ data: boosts }, { data: memberships }] = await Promise.all([
        supabase
          .from('profile_boosts')
          .select('user_id')
          .in('user_id', chunk)
          .in('payment_status', ['paid', 'simulated'])
          .gt('ends_at', new Date().toISOString()),
        supabase
          .from('memberships')
          .select('user_id, is_founder, founder_number')
          .in('user_id', chunk),
      ]);
      (boosts || []).forEach((b) => boostSet.add(b.user_id));
      (memberships || []).forEach((m) => {
        if (m.is_founder) {
          founderMap.set(m.user_id, m.founder_number ?? null);
        }
      });
    }
  } catch {
    /* badges optionnels : ne jamais bloquer le catalogue */
  }

  return { boostSet, founderMap };
}
