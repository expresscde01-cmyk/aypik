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
};

function asBreakOrigin(value: unknown): MatchBreakOrigin {
  return value === 'flash' ? 'flash' : 'like';
}

function asBreakAction(value: unknown): MatchBreakAction {
  return value === 'break' ? 'break' : 'archive';
}

export async function fetchMatchBreaks(): Promise<MatchBreakRow[]> {
  const { data, error } = await supabase
    .from('match_breaks')
    .select('id, peer_id, origin, action, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: String((row as MatchBreakRow).id),
    peer_id: String((row as MatchBreakRow).peer_id),
    origin: asBreakOrigin((row as MatchBreakRow).origin),
    action: asBreakAction((row as MatchBreakRow).action),
    created_at: String((row as MatchBreakRow).created_at || ''),
  }));
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
