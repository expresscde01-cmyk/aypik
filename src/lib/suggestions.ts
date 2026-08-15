import { supabase } from '@/lib/supabase';
import type { Profile, ProfileGender } from '@/components/ProfileSetup';
import { isWithinAgeGap, matchingTargetGender, MIN_USER_AGE } from '@/lib/dating';
import { geoProximityFlags } from '@/lib/geoProximity';

export { displaySocialNotification } from '@/lib/interactionCopy';

export type SocialNotificationKind =
  | 'flash_received'
  | 'like_received'
  | 'match_created'
  | 'message_received';

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
};

function parseProfileGender(value: unknown): ProfileGender | null {
  return value === 'homme' || value === 'femme' ? value : null;
}

export async function fetchSuggestedProfiles(options?: {
  limit?: number;
  sameCityOnly?: boolean;
  minInterestOverlap?: number;
  myInterests?: string[];
  myAge?: number;
  viewerGender?: ProfileGender | null;
}): Promise<SuggestedProfile[]> {
  const minOverlap = options?.minInterestOverlap ?? 0;

  const { data, error } = await supabase.rpc('suggest_profiles', {
    p_limit: options?.limit ?? 12,
    p_same_city_only: options?.sameCityOnly ?? false,
    p_min_interest_overlap: minOverlap,
  });

  if (error) throw error;

  const myInterests = options?.myInterests || [];

  const mapped = ((data || []) as Array<Record<string, unknown>>).map((row) => {
    const interests = Array.isArray(row.interests)
      ? (row.interests as string[])
      : [];
    const mutual = myInterests.length
      ? interests.filter((i) => myInterests.includes(i))
      : interests.slice(0, row.mutual_interest_count as number);

    return {
      id: String(row.id),
      display_name: String(row.display_name || ''),
      birth_date: String(row.birth_date || ''),
      bio: String(row.bio || ''),
      has_children: Boolean(row.has_children),
      location: String(row.location || ''),
      interests,
      photo_url: String(row.photo_url || ''),
      gender: parseProfileGender(row.gender),
      score: Number(row.score) || 0,
      mutual_interest_count: Number(row.mutual_interest_count) || 0,
      same_city: Boolean(row.same_city),
      same_department: Boolean(row.same_department),
      same_region: Boolean(row.same_region),
      neighboring_region: Boolean(row.neighboring_region),
      age: Number(row.age) || 0,
      is_boosted: Boolean(row.is_boosted),
      mutual_interests: mutual,
    };
  });

  const myAge = options?.myAge;
  if (typeof myAge !== 'number' || !Number.isFinite(myAge)) {
    return [];
  }

  const targetGender = matchingTargetGender(options?.viewerGender);

  return mapped.filter((p) => {
    if (myAge < MIN_USER_AGE || p.age < MIN_USER_AGE) {
      return false;
    }
    if (!isWithinAgeGap(myAge, p.age) || !isWithinAgeGap(p.age, myAge)) {
      return false;
    }
    if (targetGender && p.gender !== targetGender) {
      return false;
    }
    // Accueil : ville / département / région uniquement.
    // Région voisine + intérêts (même 3–4) ne suffisent pas.
    if (!p.same_city && !p.same_department && !p.same_region) {
      return false;
    }
    return true;
  });
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
