import { supabase } from '@/lib/supabase';
import { emitInboxUpdated } from '@/lib/messaging';
import type { InteractionOrigin } from '@/lib/interactionCopy';
import {
  fetchSocialNotifications,
  markSocialNotificationRead,
} from '@/lib/suggestions';

/** Marqueur écrit en base (UPDATE autorisé) pour que la notif ne réapparaisse plus. */
export const DECLINED_DISMISSED_BODY = 'AYPIK_DISMISSED';

export type DeclinedArchiveSource = 'theirs' | 'mine';

export type DeclinedArchiveRow = {
  id: string;
  actor_id: string;
  origin: InteractionOrigin;
  declined_at: string;
  archived_at: string;
  source?: DeclinedArchiveSource;
};

export type PendingDeclinedNotice = {
  notificationId: string;
  actorId: string;
  origin: InteractionOrigin;
  createdAt: string;
};

type HandledStore = {
  notificationIds: string[];
  actorIds: string[];
  archives: Array<{
    actor_id: string;
    origin: InteractionOrigin;
    declined_at: string;
    archived_at: string;
    source?: DeclinedArchiveSource;
  }>;
  removedArchiveActorIds: string[];
};

const emptyStore = (): HandledStore => ({
  notificationIds: [],
  actorIds: [],
  archives: [],
  removedArchiveActorIds: [],
});

function storageKey(userId: string) {
  return `aypik:declined-handled:${userId}`;
}

let memUserId: string | null = null;
let memStore: HandledStore = emptyStore();

function readStore(userId: string): HandledStore {
  if (memUserId === userId) return memStore;
  memUserId = userId;
  memStore = emptyStore();
  if (typeof localStorage === 'undefined') return memStore;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return memStore;
    const parsed = JSON.parse(raw) as Partial<HandledStore>;
    memStore = {
      notificationIds: Array.isArray(parsed.notificationIds)
        ? parsed.notificationIds.map(String)
        : [],
      actorIds: Array.isArray(parsed.actorIds)
        ? parsed.actorIds.map(String)
        : [],
      archives: Array.isArray(parsed.archives)
        ? parsed.archives.filter(
            (row): row is HandledStore['archives'][number] =>
              Boolean(row && row.actor_id)
          )
        : [],
      removedArchiveActorIds: Array.isArray(parsed.removedArchiveActorIds)
        ? parsed.removedArchiveActorIds.map(String)
        : [],
    };
  } catch {
    memStore = emptyStore();
  }
  return memStore;
}

function writeStore(userId: string, store: HandledStore) {
  memUserId = userId;
  memStore = store;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(store));
  } catch {
    /* quota / mode privé */
  }
}

export function rememberDeclinedHandled(
  userId: string,
  payload: {
    notificationId: string;
    actorId: string;
    archive: boolean;
    origin?: InteractionOrigin | null;
    declinedAt?: string | null;
  }
) {
  const store = readStore(userId);
  if (!store.notificationIds.includes(payload.notificationId)) {
    store.notificationIds.push(payload.notificationId);
  }
  if (!store.actorIds.includes(payload.actorId)) {
    store.actorIds.push(payload.actorId);
  }
  if (payload.archive) {
    const origin: InteractionOrigin =
      payload.origin === 'flash' ? 'flash' : 'like';
    store.removedArchiveActorIds = store.removedArchiveActorIds.filter(
      (id) => id !== payload.actorId
    );
    store.archives = [
      {
        actor_id: payload.actorId,
        origin,
        declined_at: payload.declinedAt || new Date().toISOString(),
        archived_at: new Date().toISOString(),
        source: 'theirs' as DeclinedArchiveSource,
      },
      ...store.archives.filter((row) => row.actor_id !== payload.actorId),
    ];
  }
  writeStore(userId, store);
}

export function rememberSelfArchive(
  userId: string,
  payload: {
    actorId: string;
    origin?: InteractionOrigin | null;
    declinedAt?: string | null;
  }
) {
  const store = readStore(userId);
  store.removedArchiveActorIds = store.removedArchiveActorIds.filter(
    (id) => id !== payload.actorId
  );
  const origin: InteractionOrigin =
    payload.origin === 'flash' ? 'flash' : 'like';
  store.archives = [
    {
      actor_id: payload.actorId,
      origin,
      declined_at: payload.declinedAt || new Date().toISOString(),
      archived_at: new Date().toISOString(),
      source: 'mine',
    },
    ...store.archives.filter((row) => row.actor_id !== payload.actorId),
  ];
  writeStore(userId, store);
}

export function forgetDeclinedArchive(userId: string, actorId: string) {
  const store = readStore(userId);
  store.archives = store.archives.filter((row) => row.actor_id !== actorId);
  if (!store.removedArchiveActorIds.includes(actorId)) {
    store.removedArchiveActorIds.push(actorId);
  }
  writeStore(userId, store);
}

export function isDeclinedHandled(
  userId: string | null | undefined,
  notificationId?: string | null,
  actorId?: string | null
): boolean {
  if (!userId) return false;
  const store = readStore(userId);
  if (notificationId && store.notificationIds.includes(notificationId)) {
    return true;
  }
  if (actorId && store.actorIds.includes(actorId)) return true;
  return false;
}

export function isDismissedDeclinedNotification(
  n: {
    id?: string | null;
    kind?: string | null;
    actor_id?: string | null;
    body?: string | null;
  },
  userId?: string | null
): boolean {
  if (n.kind !== 'match_declined') return false;
  if (
    typeof n.body === 'string' &&
    n.body.startsWith(DECLINED_DISMISSED_BODY)
  ) {
    return true;
  }
  return isDeclinedHandled(userId, n.id, n.actor_id);
}

function mergeArchiveRows(
  server: DeclinedArchiveRow[],
  local: HandledStore['archives'],
  removedActorIds: string[] = []
): DeclinedArchiveRow[] {
  const removed = new Set(removedActorIds);
  const byActor = new Map<string, DeclinedArchiveRow>();
  for (const row of server) {
    if (removed.has(row.actor_id)) continue;
    byActor.set(row.actor_id, row);
  }
  for (const row of local) {
    if (removed.has(row.actor_id) || byActor.has(row.actor_id)) continue;
    byActor.set(row.actor_id, {
      id: `local-${row.actor_id}`,
      actor_id: row.actor_id,
      origin: row.origin === 'flash' ? 'flash' : 'like',
      declined_at: row.declined_at,
      archived_at: row.archived_at,
      source: row.source === 'mine' ? 'mine' : 'theirs',
    });
  }
  return [...byActor.values()].sort((a, b) =>
    String(b.archived_at).localeCompare(String(a.archived_at))
  );
}

export async function fetchDeclinedArchives(): Promise<DeclinedArchiveRow[]> {
  const { data: authData } = await supabase.auth.getUser();
  const me = authData.user?.id;
  const stored = me ? readStore(me) : emptyStore();
  const local = stored.archives;
  const removed = stored.removedArchiveActorIds;

  const { data, error } = await supabase
    .from('declined_archives')
    .select('id, actor_id, origin, declined_at, archived_at')
    .order('archived_at', { ascending: false });

  if (error) {
    console.error('[declined-archives] fetch', error);
    return mergeArchiveRows([], local, removed);
  }

  const server = (data || []).map((row) => ({
    id: String((row as DeclinedArchiveRow).id),
    actor_id: String((row as DeclinedArchiveRow).actor_id),
    origin: ((row as DeclinedArchiveRow).origin === 'flash'
      ? 'flash'
      : 'like') as InteractionOrigin,
    declined_at: String((row as DeclinedArchiveRow).declined_at || ''),
    archived_at: String((row as DeclinedArchiveRow).archived_at || ''),
  }));
  return mergeArchiveRows(server, local, removed);
}

export async function deleteDeclinedArchive(
  archiveId: string,
  actorId: string
): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const me = authData.user?.id;
  if (!me) throw new Error('not_authenticated');

  forgetDeclinedArchive(me, actorId);

  const isLocalId =
    archiveId.startsWith('local-') || archiveId.startsWith('tmp-');
  if (!isLocalId) {
    const { error } = await supabase
      .from('declined_archives')
      .delete()
      .eq('id', archiveId)
      .eq('user_id', me);
    if (error) console.error('[declined-archives] delete by id', error);
  }

  const { error: actorError } = await supabase
    .from('declined_archives')
    .delete()
    .eq('user_id', me)
    .eq('actor_id', actorId);
  if (actorError) {
    console.error('[declined-archives] delete by actor', actorError);
  }
}

export async function fetchPendingDeclinedNotices(): Promise<
  PendingDeclinedNotice[]
> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const me = authData.user?.id ?? null;
    const list = await fetchSocialNotifications(50);
    const notices: PendingDeclinedNotice[] = [];
    const seen = new Set<string>();
    for (const n of list) {
      if (n.kind !== 'match_declined' || !n.actor_id) continue;
      if (isDismissedDeclinedNotification(n, me)) continue;
      if (seen.has(n.actor_id)) continue;
      seen.add(n.actor_id);
      notices.push({
        notificationId: n.id,
        actorId: n.actor_id,
        origin: /Flash/i.test(n.body) ? 'flash' : 'like',
        createdAt: n.created_at,
      });
    }
    return notices;
  } catch (err) {
    console.error('[declined-archives] pending', err);
    return [];
  }
}

async function persistDeclinedDismiss(params: {
  me: string;
  notificationId: string;
  archive: boolean;
  origin?: InteractionOrigin | null;
  actorId?: string | null;
  declinedAt?: string | null;
}): Promise<void> {
  const { me, notificationId, archive, origin, actorId, declinedAt } = params;

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'dismiss_declined_notification',
    {
      p_id: notificationId,
      p_archive: archive,
      p_origin: origin ?? null,
    }
  );

  const rpcOk =
    !rpcError && (rpcData as { ok?: boolean } | null)?.ok !== false;
  if (rpcOk) return;

  if (archive && actorId) {
    const payload = {
      user_id: me,
      actor_id: actorId,
      origin: origin === 'flash' ? 'flash' : 'like',
      declined_at: declinedAt || new Date().toISOString(),
      archived_at: new Date().toISOString(),
    };
    const { error: insertError } = await supabase
      .from('declined_archives')
      .insert(payload);
    if (insertError) {
      const unique =
        insertError.code === '23505' ||
        /duplicate|unique/i.test(insertError.message || '');
      if (unique) {
        await supabase
          .from('declined_archives')
          .update({
            origin: payload.origin,
            declined_at: payload.declined_at,
            archived_at: payload.archived_at,
          })
          .eq('user_id', me)
          .eq('actor_id', actorId);
      }
    }
  }

  let query = supabase
    .from('social_notifications')
    .update({
      read_at: new Date().toISOString(),
      body: DECLINED_DISMISSED_BODY,
    })
    .eq('user_id', me)
    .eq('kind', 'match_declined');
  if (actorId) query = query.eq('actor_id', actorId);
  else query = query.eq('id', notificationId);
  await query.select('id');

  await supabase
    .from('social_notifications')
    .delete()
    .eq('user_id', me)
    .eq('kind', 'match_declined')
    .eq('id', notificationId);

  try {
    await markSocialNotificationRead(notificationId);
  } catch {
    /* déjà traitée localement */
  }
}

export async function dismissDeclinedNotification(
  notificationId: string,
  archive: boolean,
  origin?: InteractionOrigin | null,
  actorId?: string | null,
  declinedAt?: string | null
): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const me = authData.user?.id;
  if (!me) throw new Error('not_authenticated');

  if (actorId) {
    rememberDeclinedHandled(me, {
      notificationId,
      actorId,
      archive,
      origin,
      declinedAt,
    });
  }

  try {
    await persistDeclinedDismiss({
      me,
      notificationId,
      archive,
      origin,
      actorId,
      declinedAt,
    });
  } catch (err) {
    console.error('[declined-archives] persist', err);
  }

  emitInboxUpdated({
    actorId: actorId ?? null,
    decision: 'declined-dismiss',
    notificationId,
  });
}
