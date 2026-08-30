import { supabase } from '@/lib/supabase';
import { emitInboxUpdated } from '@/lib/messaging';

export type MatchBreakAction = 'archive' | 'break';
export type MatchBreakOrigin = 'like' | 'flash';

export type MatchBreakRow = {
  id: string;
  peer_id: string;
  origin: MatchBreakOrigin;
  action: MatchBreakAction;
  created_at: string;
  initiated_by: string | null;
};

function asBreakOrigin(value: unknown): MatchBreakOrigin {
  return value === 'flash' ? 'flash' : 'like';
}

function asBreakAction(value: unknown): MatchBreakAction {
  return value === 'break' ? 'break' : 'archive';
}

/** Archive unilatérale, ou rupture dont le viewer est l’auteur → « par toi ». */
export function matchBreakSource(
  action: MatchBreakAction,
  initiatedBy: string | null | undefined,
  viewerId: string
): 'mine' | 'theirs' {
  if (action === 'archive') return 'mine';
  if (initiatedBy && initiatedBy !== viewerId) return 'theirs';
  return 'mine';
}

export async function fetchMatchBreaks(): Promise<MatchBreakRow[]> {
  const mapRows = (
    data: unknown[] | null,
    withInitiator: boolean
  ): MatchBreakRow[] =>
    (data || []).map((raw) => {
      const row = raw as MatchBreakRow & { initiated_by?: string | null };
      return {
        id: String(row.id),
        peer_id: String(row.peer_id),
        origin: asBreakOrigin(row.origin),
        action: asBreakAction(row.action),
        created_at: String(row.created_at || ''),
        initiated_by: withInitiator
          ? typeof row.initiated_by === 'string'
            ? row.initiated_by
            : null
          : null,
      };
    });

  const withCol = await supabase
    .from('match_breaks')
    .select('id, peer_id, origin, action, created_at, initiated_by')
    .order('created_at', { ascending: false });
  if (!withCol.error) return mapRows(withCol.data, true);

  const fallback = await supabase
    .from('match_breaks')
    .select('id, peer_id, origin, action, created_at')
    .order('created_at', { ascending: false });
  if (fallback.error) throw fallback.error;
  return mapRows(fallback.data, false);
}

async function callMatchRpc(
  fn: 'manage_active_match' | 'restore_broken_match' | 'purge_broken_match',
  args: Record<string, unknown>
): Promise<void> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  const row = (data || {}) as { ok?: boolean; error?: string };
  if (row.ok === false) {
    throw new Error(row.error || 'match_break_failed');
  }
}

export async function archiveActiveMatch(peerId: string): Promise<void> {
  await callMatchRpc('manage_active_match', {
    p_peer: peerId,
    p_break: false,
  });
  emitInboxUpdated({ actorId: peerId, decision: 'match-archive' });
}

export async function breakActiveMatch(peerId: string): Promise<void> {
  await callMatchRpc('manage_active_match', {
    p_peer: peerId,
    p_break: true,
  });
  emitInboxUpdated({ actorId: peerId, decision: 'match-break' });
}

export async function restoreBrokenMatch(peerId: string): Promise<void> {
  await callMatchRpc('restore_broken_match', { p_peer: peerId });
  emitInboxUpdated({ actorId: peerId, decision: 'match-restore' });
}

export async function purgeBrokenMatch(peerId: string): Promise<void> {
  await callMatchRpc('purge_broken_match', { p_peer: peerId });
  emitInboxUpdated({ actorId: peerId, decision: 'match-purge' });
}

/** Suppression définitive depuis un match encore actif (archive puis purge). */
export async function purgeActiveMatch(peerId: string): Promise<void> {
  await archiveActiveMatch(peerId);
  await purgeBrokenMatch(peerId);
}
