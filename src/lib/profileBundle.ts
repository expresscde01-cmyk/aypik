import { type Profile } from '@/components/ProfileSetup';
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

export async function loadCardProfiles<T = Profile>(ids: string[]): Promise<T[]> {
  if (ids.length === 0) return [];
  return fetchByIdChunks<T>(ids, async (chunk) => {
    const rpc = await supabase.rpc('card_profiles', { p_ids: chunk });
    return {
      data: (rpc.data as T[] | null) ?? null,
      error: rpc.error,
    };
  });
}

export async function fetchProfileBundle(ids: string[]): Promise<{
  byId: Map<string, Profile>;
  founderMap: Map<string, number | null>;
  boostSet: Set<string>;
}> {
  if (ids.length === 0) {
    return { byId: new Map(), founderMap: new Map(), boostSet: new Set() };
  }
  const [profiles, memberships, boosts] = await Promise.all([
    fetchByIdChunks<Profile>(ids, async (chunk) => {
      const rpc = await supabase.rpc('card_profiles', { p_ids: chunk });
      if (rpc.error) return { data: null, error: rpc.error };
      const rows = ((rpc.data ?? []) as Profile[]).map((row) => ({
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
    }),
    fetchByIdChunks<{
      user_id: string;
      is_founder: boolean | null;
      founder_number: number | null;
    }>(ids, async (chunk) => {
      const rpc = await supabase.rpc('founder_public_badges', { p_ids: chunk });
      return {
        data: (rpc.data as { user_id: string; is_founder: boolean | null; founder_number: number | null }[] | null) ?? null,
        error: rpc.error,
      };
    }),
    fetchByIdChunks<{ user_id: string }>(ids, async (chunk) => {
      const rpc = await supabase.rpc('active_boost_user_ids', { p_ids: chunk });
      return {
        data: (rpc.data as { user_id: string }[] | null) ?? null,
        error: rpc.error,
      };
    }),
  ]);
  const founderMap = new Map<string, number | null>();
  memberships.forEach((m) => {
    if (m.is_founder) founderMap.set(m.user_id, m.founder_number ?? null);
  });
  const boostSet = new Set(boosts.map((b) => b.user_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return { byId, founderMap, boostSet };
}
