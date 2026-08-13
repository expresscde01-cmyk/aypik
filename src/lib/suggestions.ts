import { supabase } from '@/lib/supabase';
import type { Profile, ProfileGender } from '@/components/ProfileSetup';
import { isWithinAgeGap, matchingTargetGender } from '@/lib/dating';

export type SocialNotificationKind =
  | 'flash_received'
  | 'like_received'
  | 'match_created';

export type SocialNotification = {
  id: string;
  user_id: string;
  kind: SocialNotificationKind;
  title: string;
  body: string;
  actor_id: string | null;
  flash_id: string | null;
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

export type SuggestedProfile = Profile & {
  score: number;
  mutual_interest_count: number;
  same_city: boolean;
  same_department: boolean;
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
    if (!isWithinAgeGap(myAge, p.age) || !isWithinAgeGap(p.age, myAge)) {
      return false;
    }
    if (targetGender && p.gender != null && p.gender !== targetGender) {
      return false;
    }
    return true;
  });
}

/** Affinité géographique à partir des libellés « Ville (CP) » (sans lat/lng). */
export function cityAffinityScore(a: string, b: string): number {
  if (!a?.trim() || !b?.trim()) return 0;
  if (a.trim() === b.trim()) return 100;

  const parse = (loc: string) => {
    const range = loc.trim().match(/^(.+?)\s*\((\d{5})/);
    if (range) {
      return {
        name: range[1].trim().toLowerCase(),
        cp: range[2],
        dept: range[2].slice(0, 2),
      };
    }
    return { name: loc.trim().toLowerCase(), cp: '', dept: '' };
  };

  const A = parse(a);
  const B = parse(b);
  if (A.cp && A.cp === B.cp) return 90;
  if (A.name && A.name === B.name) return 80;
  if (A.dept && A.dept === B.dept) return 50;
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
    city >= 100 ? 35 : city >= 80 ? 28 : city >= 50 ? 15 : city * 0.15;
  return (
    params.mutualInterestCount * 40 +
    cityPoints +
    ageProximity +
    (params.isBoosted ? 25 : 0)
  );
}
