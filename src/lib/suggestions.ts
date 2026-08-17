import { supabase } from '@/lib/supabase';
import type { Profile, ProfileGender } from '@/components/ProfileSetup';
import {
  ageFromBirthDate,
  latestBirthDateForAge,
  matchingTargetGender,
  minPartnerAge,
  parseProfileGender,
  MIN_USER_AGE,
} from '@/lib/dating';
import { geoProximityFlags } from '@/lib/geoProximity';
import {
  passesSuggestionPillars,
  resolveProfileDistances,
  suggestionGeoBadge,
} from '@/lib/suggestionMatch';
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
  | 'match_wait_reminder';

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

/** Interlocuteurs avec au moins un message échangé (pour masquer les matchs obsolètes). */
export async function fetchPeersWithMessages(): Promise<Set<string>> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return new Set();

  const { data, error } = await supabase
    .from('messages')
    .select('sender_id, recipient_id')
    .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
    .limit(800);

  if (error) {
    console.error('[notifications] fetchPeersWithMessages', error);
    return new Set();
  }

  const peers = new Set<string>();
  for (const row of data || []) {
    const sender = (row as { sender_id: string }).sender_id;
    const recipient = (row as { recipient_id: string }).recipient_id;
    if (sender === me && recipient) peers.add(recipient);
    else if (recipient === me && sender) peers.add(sender);
  }
  return peers;
}

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
  if (error) {
    console.error('[notifications] sweep_stale_social_notifications', error);
  }
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
  geo_badge: string | null;
};

export async function fetchSuggestedProfiles(options?: {
  limit?: number;
  myInterests?: string[];
  myAge?: number;
  myLocation?: string;
  viewerGender?: ProfileGender | null;
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

  const prefs = options?.prefs ?? DEFAULT_SUGGESTION_PREFS;
  const myInterests = options?.myInterests || [];
  const myLocation = options?.myLocation || '';
  const targetGender = matchingTargetGender(options?.viewerGender);
  const myMinAge = minPartnerAge(myAge);
  const excludeInteracted = options?.excludeLikedAndFlashed !== false;
  const limit = Math.min(
    Math.max(options?.limit ?? HOME_SUGGESTIONS_MAX, 1),
    HOME_SUGGESTIONS_MAX
  );

  const rows: Profile[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    if (options?.signal?.aborted) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', me)
      .eq('has_children', false)
      .is('deletion_requested_at', null)
      .lte('birth_date', latestBirthDateForAge(Math.max(MIN_USER_AGE, myMinAge)))
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const page = (data || []) as Profile[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  if (options?.signal?.aborted) return [];
  const ids = rows.map((p) => p.id);

  const excluded = new Set<string>();
  const boostSet = new Set<string>();

  if (ids.length > 0) {
    const [likesRes, flashesRes] = await Promise.all([
      excludeInteracted
        ? supabase.from('likes').select('to_user').eq('from_user', me)
        : Promise.resolve({ data: [] as { to_user: string }[] }),
      excludeInteracted
        ? supabase.from('flashes').select('to_user').eq('from_user', me)
        : Promise.resolve({ data: [] as { to_user: string }[] }),
    ]);

    (likesRes.data || []).forEach((row) => excluded.add(row.to_user));
    (flashesRes.data || []).forEach((row) => excluded.add(row.to_user));

    try {
      for (let i = 0; i < ids.length; i += 80) {
        const chunk = ids.slice(i, i + 80);
        const { data: boosts } = await supabase
          .from('profile_boosts')
          .select('user_id')
          .in('user_id', chunk)
          .in('payment_status', ['paid', 'simulated'])
          .gt('ends_at', new Date().toISOString());
        (boosts || []).forEach((row) => boostSet.add(row.user_id));
      }
    } catch {
      /* badges optionnels */
    }
  }

  if (options?.signal?.aborted) return [];

  const withFlags = rows
    .filter((profile) => !excluded.has(profile.id))
    .map((profile) => {
      const age = ageFromBirthDate(profile.birth_date);
      const interests = profile.interests || [];
      const mutual = myInterests.filter((i) => interests.includes(i));
      const flags = geoProximityFlags(myLocation, profile.location || '');
      const is_boosted = boostSet.has(profile.id);
      return {
        ...profile,
        gender: parseProfileGender(profile.gender),
        age,
        interests,
        mutual_interests: mutual,
        mutual_interest_count: mutual.length,
        is_boosted,
        same_city: flags.same_city,
        same_department: flags.same_department,
        same_region: flags.same_region,
        neighboring_region: flags.neighboring_region,
        score: rankProfileScore({
          myAge,
          theirAge: age,
          myLocation,
          theirLocation: profile.location || '',
          mutualInterestCount: mutual.length,
          isBoosted: is_boosted,
        }),
        distance_km: null as number | null,
        geo_badge: null as string | null,
      };
    });

  const distances = await resolveProfileDistances(
    myLocation,
    withFlags,
    prefs,
    options?.signal
  );
  if (options?.signal?.aborted) return [];

  return withFlags
    .map((profile) => {
      const distance_km = distances.get(profile.id) ?? null;
      return {
        ...profile,
        distance_km,
        geo_badge: suggestionGeoBadge(profile, distance_km, prefs),
      };
    })
    .filter((profile) =>
      passesSuggestionPillars(
        {
          gender: profile.gender,
          age: profile.age,
          mutualCount: profile.mutual_interest_count,
          flags: profile,
          distanceKm: profile.distance_km,
        },
        myAge,
        targetGender,
        prefs
      )
    )
    .sort(
      (a, b) =>
        b.score - a.score || Number(b.is_boosted) - Number(a.is_boosted)
    )
    .slice(0, limit);
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
