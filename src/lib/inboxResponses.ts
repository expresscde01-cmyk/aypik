import { supabase } from '@/lib/supabase';
import { emitInboxUpdated } from '@/lib/messaging';
import { sweepStaleSocialNotifications } from '@/lib/suggestions';
import { rememberClearedWait } from '@/lib/waitArchives';

export type InboxDecision = 'wait' | 'refuse' | 'match';
export type InboxOrigin = 'flash' | 'like';

export type InboxResponseRow = {
  actor_id: string;
  decision: InboxDecision;
  origin: InboxOrigin;
  updated_at: string;
};

function rpcMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message || '');
  }
  return String(err || '');
}

function rpcCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code: unknown }).code || '');
  }
  return '';
}

function isMissingRoutine(err: unknown): boolean {
  const msg = rpcMessage(err);
  const code = rpcCode(err);
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    /could not find the function|schema cache|does not exist/i.test(msg)
  );
}

async function afterInboxReset(actorId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (me) {
    rememberClearedWait(me, actorId);
    try {
      await supabase
        .from('social_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', me)
        .eq('actor_id', actorId)
        .eq('kind', 'match_wait_reminder');
    } catch {
      /* non bloquant */
    }
  }
  try {
    await sweepStaleSocialNotifications(actorId);
  } catch {
    /* non bloquant */
  }
  emitInboxUpdated({ actorId, decision: 'reset' });
}

async function currentInboxDecision(
  actorId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('inbox_responses')
    .select('decision')
    .eq('actor_id', actorId)
    .maybeSingle();
  return (data as { decision?: string } | null)?.decision ?? null;
}

async function confirmWaitRestored(actorId: string, silent?: boolean) {
  if (silent) return;
  try {
    await sweepStaleSocialNotifications(actorId);
  } catch {
    /* non bloquant */
  }
  emitInboxUpdated({ actorId, decision: 'wait' });
}

async function writeWaitRow(
  actorId: string,
  origin?: InboxOrigin | null
): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return false;
  const now = new Date().toISOString();
  const { error } = await supabase.from('inbox_responses').upsert(
    {
      user_id: me,
      actor_id: actorId,
      decision: 'wait',
      origin: origin === 'flash' ? 'flash' : 'like',
      updated_at: now,
    },
    { onConflict: 'user_id,actor_id' }
  );
  if (error) return false;
  return (await currentInboxDecision(actorId)) === 'wait';
}

/** Rétablit Attendre depuis une archive (déverrouille aussi un refus). */
export async function restoreWaitFromArchive(
  actorId: string,
  origin?: InboxOrigin | null,
  opts?: { silent?: boolean }
): Promise<{ ok: boolean }> {
  const silent = Boolean(opts?.silent);
  const dedicated = await supabase.rpc('restore_inbox_wait', {
    p_actor: actorId,
    p_origin: origin ?? null,
  });
  if (!dedicated.error) {
    await confirmWaitRestored(actorId, silent);
    return { ok: true };
  }

  const dedicatedMsg = rpcMessage(dedicated.error);
  if (dedicatedMsg.includes('decision_locked_match')) {
    throw dedicated.error;
  }

  let decision = await currentInboxDecision(actorId);
  if (decision === 'wait') {
    await confirmWaitRestored(actorId, silent);
    return { ok: true };
  }
  if (decision === 'match') {
    throw new Error('decision_locked_match');
  }

  const now = new Date().toISOString();
  await supabase
    .from('inbox_responses')
    .update({ decision: 'wait', updated_at: now })
    .eq('actor_id', actorId)
    .in('decision', ['wait', 'refuse']);

  decision = await currentInboxDecision(actorId);
  if (decision === 'wait') {
    await confirmWaitRestored(actorId, silent);
    return { ok: true };
  }

  await supabase
    .from('inbox_responses')
    .delete()
    .eq('actor_id', actorId)
    .in('decision', ['wait', 'refuse']);

  if (await writeWaitRow(actorId, origin)) {
    await confirmWaitRestored(actorId, silent);
    return { ok: true };
  }

  try {
    await respondToInboxInterest(actorId, 'wait', origin);
  } catch (err) {
    const msg = rpcMessage(err);
    if (
      msg.includes('decision_locked_wait') ||
      (await currentInboxDecision(actorId)) === 'wait'
    ) {
      await confirmWaitRestored(actorId, silent);
      return { ok: true };
    }
    if (await writeWaitRow(actorId, origin)) {
      await confirmWaitRestored(actorId, silent);
      return { ok: true };
    }
    throw err;
  }

  await confirmWaitRestored(actorId, silent);
  return { ok: true };
}

export async function fetchInboxResponses(): Promise<InboxResponseRow[]> {
  const { data, error } = await supabase
    .from('inbox_responses')
    .select('actor_id, decision, origin, updated_at');
  if (error) throw error;
  return (data || []) as InboxResponseRow[];
}

export type PendingByOtherRow = {
  peer_id: string;
  origin: InboxOrigin;
  created_at: string;
};

/** Likes/flashs que l’autre a mis en attente (RPC, hors RLS). */
export async function fetchPendingByOthers(): Promise<PendingByOtherRow[]> {
  const { data, error } = await supabase.rpc('get_pending_by_others');
  if (error) throw error;
  return (data || [])
    .map((raw) => {
      const row = raw as {
        peer_id?: unknown;
        user_id?: unknown;
        origin?: unknown;
        created_at?: unknown;
      };
      const peerId = String(row.peer_id || row.user_id || '');
      return {
        peer_id: peerId,
        origin: (row.origin === 'flash' ? 'flash' : 'like') as InboxOrigin,
        created_at: String(row.created_at || ''),
      };
    })
    .filter((row) => row.peer_id);
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
  if (error) {
    if (decision === 'wait' && rpcMessage(error).includes('decision_locked_wait')) {
      try {
        await sweepStaleSocialNotifications(actorId);
      } catch {
        /* non bloquant */
      }
      emitInboxUpdated({ actorId, decision: 'wait' });
      return { ok: true, decision: 'wait', origin: origin || 'like' };
    }
    throw error;
  }
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

/** Annule Attendre pour remettre le profil en « à étudier ». */
export async function resetInboxInterest(
  actorId: string
): Promise<{ ok: boolean }> {
  const dedicated = await supabase.rpc('reset_inbox_interest', {
    p_actor: actorId,
  });
  if (!dedicated.error) {
    await afterInboxReset(actorId);
    return { ok: true };
  }

  const dedicatedMsg = rpcMessage(dedicated.error);
  if (dedicatedMsg.includes('decision_locked_match')) {
    throw dedicated.error;
  }
  if (dedicatedMsg.includes('not_authenticated')) {
    throw dedicated.error;
  }

  if (isMissingRoutine(dedicated.error) || /reset_inbox_interest/i.test(dedicatedMsg)) {
    const viaRespond = await supabase.rpc('respond_to_inbox_interest', {
      p_actor: actorId,
      p_decision: 'reset',
      p_origin: null,
    });
    if (!viaRespond.error) {
      await afterInboxReset(actorId);
      return { ok: true };
    }
    const respondMsg = rpcMessage(viaRespond.error);
    if (respondMsg.includes('decision_locked_match')) {
      throw viaRespond.error;
    }
  }

  await supabase
    .from('inbox_responses')
    .delete()
    .eq('actor_id', actorId)
    .in('decision', ['wait', 'refuse']);
  await afterInboxReset(actorId);
  return { ok: true };
}
