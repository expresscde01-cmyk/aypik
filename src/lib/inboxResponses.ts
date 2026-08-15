import { supabase } from '@/lib/supabase';
import { emitInboxUpdated } from '@/lib/messaging';
import { sweepStaleSocialNotifications } from '@/lib/suggestions';

export type InboxDecision = 'wait' | 'refuse' | 'match';
export type InboxOrigin = 'flash' | 'like';

export type InboxResponseRow = {
  actor_id: string;
  decision: InboxDecision;
  origin: InboxOrigin;
  updated_at: string;
};

export async function fetchInboxResponses(): Promise<InboxResponseRow[]> {
  const { data, error } = await supabase
    .from('inbox_responses')
    .select('actor_id, decision, origin, updated_at');
  if (error) throw error;
  return (data || []) as InboxResponseRow[];
}

export async function respondToInboxInterest(
  actorId: string,
  decision: InboxDecision,
  origin?: InboxOrigin | null
): Promise<{ ok: boolean; decision: InboxDecision; origin: InboxOrigin }> {
  const { data, error } = await supabase.rpc('respond_to_inbox_interest', {
    p_actor: actorId,
    p_decision: decision,
    p_origin: origin ?? null,
  });
  if (error) throw error;
  const row = (data || {}) as {
    ok?: boolean;
    decision?: InboxDecision;
    origin?: InboxOrigin;
  };

  // Synchronise immédiatement la cloche (À découvrir / Flash / Like / Attente)
  try {
    await sweepStaleSocialNotifications(actorId);
  } catch {
    /* non bloquant */
  }
  emitInboxUpdated({ actorId, decision: row.decision || decision });

  return {
    ok: row.ok !== false,
    decision: row.decision || decision,
    origin: row.origin || origin || 'like',
  };
}
