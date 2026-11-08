import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { queryClient, queryKeys } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

export function useSeenMatchPeers(): {
  ready: boolean;
  ids: ReadonlySet<string>;
} {
  const { user } = useAuth();
  const userId = user?.id;
  const query = useQuery({
    queryKey: queryKeys.seenMatches(userId || ''),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_seen')
        .select('peer_id')
        .eq('user_id', userId as string);
      if (error) throw error;
      return (data ?? []).map((row) => row.peer_id as string);
    },
  });
  const ids = useMemo(() => new Set(query.data ?? []), [query.data]);
  return {
    ready: Boolean(userId) && query.isSuccess,
    ids,
  };
}

/** Enregistre le « vu » pour les matchs du membre. Les autres ids sont ignorés. */
export async function markMatchesSeen(peerIds: readonly string[]): Promise<void> {
  const ids = [...new Set(peerIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;

  const key = queryKeys.seenMatches(userId);
  const prev = queryClient.getQueryData<string[]>(key) ?? [];
  const known = new Set(prev);
  const fresh = ids.filter((id) => !known.has(id));
  if (fresh.length === 0) return;

  queryClient.setQueryData(key, [...prev, ...fresh]);
  const { error } = await supabase.rpc('mark_matches_seen', { p_peer_ids: fresh });
  if (error) queryClient.setQueryData(key, prev);
}
