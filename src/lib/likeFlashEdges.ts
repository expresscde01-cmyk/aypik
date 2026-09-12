import { supabase } from '@/lib/supabase';
import { queryClient, queryKeys } from '@/lib/queryClient';

export type LikeFlashEdges = {
  sentLikes: { to_user: string; created_at: string }[];
  receivedLikes: { from_user: string; created_at: string }[];
  receivedFlashes: { from_user: string; created_at: string }[];
  sentFlashes: { to_user: string; created_at: string }[];
};

export async function fetchLikeFlashEdges(
  userId: string
): Promise<LikeFlashEdges> {
  const [sentRes, receivedRes, inFlashRes, outFlashRes] = await Promise.all([
    supabase
      .from('likes')
      .select('to_user, created_at')
      .eq('from_user', userId),
    supabase
      .from('likes')
      .select('from_user, created_at')
      .eq('to_user', userId),
    supabase
      .from('flashes')
      .select('from_user, created_at')
      .eq('to_user', userId),
    supabase
      .from('flashes')
      .select('to_user, created_at')
      .eq('from_user', userId),
  ]);

  if (sentRes.error) throw sentRes.error;
  if (receivedRes.error) throw receivedRes.error;
  if (inFlashRes.error) throw inFlashRes.error;
  if (outFlashRes.error) throw outFlashRes.error;

  return {
    sentLikes: (sentRes.data || []) as LikeFlashEdges['sentLikes'],
    receivedLikes: (receivedRes.data || []) as LikeFlashEdges['receivedLikes'],
    receivedFlashes: (inFlashRes.data || []) as LikeFlashEdges['receivedFlashes'],
    sentFlashes: (outFlashRes.data || []) as LikeFlashEdges['sentFlashes'],
  };
}

export function queryLikeFlashEdges(
  userId: string,
  options?: { staleTime?: number }
) {
  return queryClient.fetchQuery({
    queryKey: queryKeys.likeFlashEdges(userId),
    queryFn: () => fetchLikeFlashEdges(userId),
    staleTime: options?.staleTime,
  });
}

/** Le RPC Matcher a inséré le like : le cache 60 s ne doit pas rester sans cette arête. */
export function seedSentLikeEdge(
  userId: string,
  toUser: string,
  createdAt?: string | null
) {
  if (!userId || !toUser) return;
  const at = createdAt || new Date().toISOString();
  queryClient.setQueryData(
    queryKeys.likeFlashEdges(userId),
    (old: LikeFlashEdges | undefined) => {
      const base: LikeFlashEdges = old ?? {
        sentLikes: [],
        receivedLikes: [],
        receivedFlashes: [],
        sentFlashes: [],
      };
      if (base.sentLikes.some((row) => row.to_user === toUser)) return base;
      return {
        ...base,
        sentLikes: [...base.sentLikes, { to_user: toUser, created_at: at }],
      };
    }
  );
}

export function invalidateLikeFlashEdges(userId?: string | null) {
  if (userId) {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.likeFlashEdges(userId),
    });
  }
  return queryClient.invalidateQueries({ queryKey: ['like-flash-edges'] });
}
