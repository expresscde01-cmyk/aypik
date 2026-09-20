import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { fetchInboxResponses } from '@/lib/inboxResponses';
import { mergeConfirmedInboxDecisions } from '@/lib/inboxDecisionOverlay';
import { queryLikeFlashEdges } from '@/lib/likeFlashEdges';
import { collectLiveReciprocalMatchIds } from '@/lib/matchHistoryDisplay';
import { fetchMatchBreaks } from '@/lib/matchBreaks';
import { useInboxReload } from '@/lib/messaging';
import { queryClient, queryKeys } from '@/lib/queryClient';

/** Même total que « Mes Matchs (N) », sans charger les fiches. */
export async function fetchLiveMatchCount(userId: string): Promise<number> {
  const [edges, inboxRaw, breaks] = await Promise.all([
    queryLikeFlashEdges(userId),
    fetchInboxResponses().catch(() => []),
    fetchMatchBreaks().catch(() => []),
  ]);
  const inboxRows = mergeConfirmedInboxDecisions(inboxRaw);
  return collectLiveReciprocalMatchIds({
    sentLikeIds: edges.sentLikes.map((row) => row.to_user),
    receivedLikeIds: edges.receivedLikes.map((row) => row.from_user),
    sentFlashIds: edges.sentFlashes.map((row) => row.to_user),
    receivedFlashIds: edges.receivedFlashes.map((row) => row.from_user),
    inboxRows,
    brokenPeerIds: breaks.map((row) => row.peer_id),
  }).length;
}

export function seedLiveMatchCount(userId: string, count: number) {
  if (!userId) return;
  const key = queryKeys.liveMatchCount(userId);
  void queryClient.cancelQueries({ queryKey: key });
  queryClient.setQueryData(key, count);
}

export function invalidateLiveMatchCount(userId?: string | null) {
  if (userId) {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.liveMatchCount(userId),
    });
  }
  return queryClient.invalidateQueries({ queryKey: ['live-match-count'] });
}

/**
 * Source unique du nombre de matchs actifs (1er mot + discussions).
 * `boardCount` (page Mes Matchs, après chargement) écrase le fetch léger.
 */
export function useLiveMatchCount(boardCount?: number): number {
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: queryKeys.liveMatchCount(userId || ''),
    queryFn: () => fetchLiveMatchCount(userId as string),
    enabled: Boolean(userId),
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!userId || boardCount === undefined) return;
    if (query.data === boardCount) return;
    seedLiveMatchCount(userId, boardCount);
  }, [userId, boardCount, query.data]);

  useInboxReload(() => {
    if (boardCount !== undefined) return;
    if (userId) void invalidateLiveMatchCount(userId);
  });

  if (boardCount !== undefined) return boardCount;
  return query.data ?? 0;
}
