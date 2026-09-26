import { PROFILE_CARD_COLUMNS, type Profile } from '@/components/ProfileSetup';
import { profileCardAge } from '@/lib/dating';
import { parseDiscoverMode } from '@/lib/discoverMode';
import { supabase } from '@/lib/supabase';

const PROFILE_IN_CHUNK = 80;

async function fetchByIdChunks<T>(
  ids: string[],
  run: (
    chunk: string[]
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += PROFILE_IN_CHUNK) {
    const chunk = unique.slice(i, i + PROFILE_IN_CHUNK);
    const { data, error } = await run(chunk);
    if (error) throw error;
    if (data?.length) rows.push(...data);
  }
  return rows;
}

export async function fetchProfileBundle(ids: string[]): Promise<{
  byId: Map<string, Profile>;
  founderMap: Map<string, number | null>;
  boostSet: Set<string>;
}> {
  if (ids.length === 0) {
    return { byId: new Map(), founderMap: new Map(), boostSet: new Set() };
  }
  const nowIso = new Date().toISOString();
  const [profiles, memberships, boosts] = await Promise.all([
    fetchByIdChunks<Profile>(ids, async (chunk) => {
      const rpc = await supabase.rpc('card_profiles', { p_ids: chunk });
      if (!rpc.error && rpc.data) {
        const rows = (rpc.data as Profile[]).map((row) => ({
          ...row,
          bio: row.bio || '',
          location: row.location || '',
          interests: row.interests || [],
          photo_url: row.photo_url || '',
          is_online: Boolean(row.is_online),
          age: profileCardAge(row),
          discover_mode: parseDiscoverMode(row.discover_mode),
        }));
        return { data: rows, error: null };
      }
      const fb = await supabase
        .from('profiles')
        .select(PROFILE_CARD_COLUMNS)
        .in('id', chunk);
      return {
        data:
          (fb.data as Profile[] | null)?.map((p) => ({
            ...p,
            is_online: false,
            age: profileCardAge(p),
            discover_mode: parseDiscoverMode(p.discover_mode),
          })) ?? null,
        error: fb.error,
      };
    }),
    fetchByIdChunks<{
      user_id: string;
      is_founder: boolean | null;
      founder_number: number | null;
    }>(ids, (chunk) =>
      supabase
        .from('memberships')
        .select('user_id, is_founder, founder_number')
        .in('user_id', chunk)
    ),
    fetchByIdChunks<{ user_id: string }>(ids, (chunk) =>
      supabase
        .from('profile_boosts')
        .select('user_id')
        .in('user_id', chunk)
        .in('payment_status', ['paid', 'simulated'])
        .gt('ends_at', nowIso)
    ),
  ]);
  const founderMap = new Map<string, number | null>();
  memberships.forEach((m) => {
    if (m.is_founder) founderMap.set(m.user_id, m.founder_number ?? null);
  });
  const boostSet = new Set(boosts.map((b) => b.user_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return { byId, founderMap, boostSet };
}
