import { supabase } from '@/lib/supabase';
import { emitInboxUpdated } from '@/lib/messaging';
import type { InteractionOrigin } from '@/lib/interactionCopy';
import { DECLINED_DISMISSED_BODY } from '@/lib/declinedArchives';
import {
  fetchSocialNotifications,
  markSocialNotificationRead,
} from '@/lib/suggestions';

export type WaitArchiveRow = {
  actorId: string;
  origin: InteractionOrigin;
  archivedAt: string;
  receivedAt: string;
  notificationId?: string | null;
  source: 'mine' | 'theirs';
};

export type PendingWaitingNotice = {
  notificationId: string;
  actorId: string;
  origin: InteractionOrigin;
  createdAt: string;
};

type WaitStore = {
  dismissedNotifIds: string[];
  dismissedActorIds: string[];
  archivedMine: WaitArchiveRow[];
  archivedTheirs: WaitArchiveRow[];
};

const emptyStore = (): WaitStore => ({
  dismissedNotifIds: [],
  dismissedActorIds: [],
  archivedMine: [],
  archivedTheirs: [],
});

function storageKey(userId: string) {
  return `aypik:wait-archives:${userId}`;
}

let memUserId: string | null = null;
let memStore: WaitStore = emptyStore();

function readStore(userId: string): WaitStore {
  if (memUserId === userId) return memStore;
  memUserId = userId;
  memStore = emptyStore();
  if (typeof localStorage === 'undefined') return memStore;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return memStore;
    const parsed = JSON.parse(raw) as Partial<WaitStore>;
    memStore = {
      dismissedNotifIds: Array.isArray(parsed.dismissedNotifIds)
        ? parsed.dismissedNotifIds.map(String)
        : [],
      dismissedActorIds: Array.isArray(parsed.dismissedActorIds)
        ? parsed.dismissedActorIds.map(String)
        : [],
      archivedMine: Array.isArray(parsed.archivedMine)
        ? parsed.archivedMine.filter((row) => row?.actorId)
        : [],
      archivedTheirs: Array.isArray(parsed.archivedTheirs)
        ? parsed.archivedTheirs.filter((row) => row?.actorId)
        : [],
    };
  } catch {
    memStore = emptyStore();
  }
  return memStore;
}

function writeStore(userId: string, store: WaitStore) {
  memUserId = userId;
  memStore = store;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(store));
  } catch {
    /* quota */
  }
}

function originOf(value?: InteractionOrigin | string | null): InteractionOrigin {
  return value === 'flash' ? 'flash' : 'like';
}

export function isMineWaitArchived(userId: string | null | undefined, actorId: string) {
  if (!userId) return false;
  return readStore(userId).archivedMine.some((row) => row.actorId === actorId);
}

export function listMineWaitArchives(userId: string): WaitArchiveRow[] {
  return [...readStore(userId).archivedMine].sort(
    (a, b) => Date.parse(b.archivedAt) - Date.parse(a.archivedAt)
  );
}

export function listTheirsWaitArchives(userId: string): WaitArchiveRow[] {
  return [...readStore(userId).archivedTheirs].sort(
    (a, b) => Date.parse(b.archivedAt) - Date.parse(a.archivedAt)
  );
}

export function listAllWaitArchives(userId: string): WaitArchiveRow[] {
  const store = readStore(userId);
  return [...store.archivedMine, ...store.archivedTheirs].sort(
    (a, b) => Date.parse(b.archivedAt) - Date.parse(a.archivedAt)
  );
}

export function rememberMineWaitArchive(
  userId: string,
  payload: {
    actorId: string;
    origin?: InteractionOrigin | null;
    receivedAt?: string | null;
  }
) {
  const store = readStore(userId);
  const row: WaitArchiveRow = {
    actorId: payload.actorId,
    origin: originOf(payload.origin),
    archivedAt: new Date().toISOString(),
    receivedAt: payload.receivedAt || new Date().toISOString(),
    source: 'mine',
  };
  store.archivedMine = [
    row,
    ...store.archivedMine.filter((r) => r.actorId !== payload.actorId),
  ];
  writeStore(userId, store);
}

export function rememberTheirsWaitArchive(
  userId: string,
  payload: {
    actorId: string;
    origin?: InteractionOrigin | null;
    receivedAt?: string | null;
    notificationId?: string | null;
  }
) {
  const store = readStore(userId);
  if (payload.notificationId && !store.dismissedNotifIds.includes(payload.notificationId)) {
    store.dismissedNotifIds.push(payload.notificationId);
  }
  if (!store.dismissedActorIds.includes(payload.actorId)) {
    store.dismissedActorIds.push(payload.actorId);
  }
  const row: WaitArchiveRow = {
    actorId: payload.actorId,
    origin: originOf(payload.origin),
    archivedAt: new Date().toISOString(),
    receivedAt: payload.receivedAt || new Date().toISOString(),
    notificationId: payload.notificationId,
    source: 'theirs',
  };
  store.archivedTheirs = [
    row,
    ...store.archivedTheirs.filter((r) => r.actorId !== payload.actorId),
  ];
  writeStore(userId, store);
}

export function forgetWaitArchive(userId: string, actorId: string) {
  const store = readStore(userId);
  store.archivedMine = store.archivedMine.filter((r) => r.actorId !== actorId);
  store.archivedTheirs = store.archivedTheirs.filter((r) => r.actorId !== actorId);
  writeStore(userId, store);
}

export function rememberWaitingDismissed(
  userId: string,
  payload: { notificationId?: string | null; actorId?: string | null }
) {
  const store = readStore(userId);
  if (payload.notificationId && !store.dismissedNotifIds.includes(payload.notificationId)) {
    store.dismissedNotifIds.push(payload.notificationId);
  }
  if (payload.actorId && !store.dismissedActorIds.includes(payload.actorId)) {
    store.dismissedActorIds.push(payload.actorId);
  }
  writeStore(userId, store);
}

export function isWaitingNoticeDismissed(
  n: { id?: string | null; kind?: string | null; actor_id?: string | null; body?: string | null },
  userId?: string | null
): boolean {
  if (n.kind !== 'match_waiting' && n.kind !== 'match_wait_reminder') return false;
  if (typeof n.body === 'string' && n.body.startsWith(DECLINED_DISMISSED_BODY)) {
    return true;
  }
  if (!userId) return false;
  const store = readStore(userId);
  if (n.id && store.dismissedNotifIds.includes(n.id)) return true;
  if (n.kind === 'match_waiting' && n.actor_id && store.dismissedActorIds.includes(n.actor_id)) {
    return true;
  }
  if (
    n.kind === 'match_wait_reminder' &&
    n.actor_id &&
    store.archivedMine.some((row) => row.actorId === n.actor_id)
  ) {
    return true;
  }
  return false;
}

export async function fetchPendingWaitingNotices(): Promise<PendingWaitingNotice[]> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const me = authData.user?.id ?? null;
    const list = await fetchSocialNotifications(50);
    const notices: PendingWaitingNotice[] = [];
    const seen = new Set<string>();
    for (const n of list) {
      if (n.kind !== 'match_waiting' || !n.actor_id) continue;
      if (isWaitingNoticeDismissed(n, me)) continue;
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
    console.error('[wait-archives] pending', err);
    return [];
  }
}

export async function dismissWaitingNotification(opts: {
  notificationId?: string | null;
  actorId?: string | null;
  kinds?: Array<'match_waiting' | 'match_wait_reminder'>;
}): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const me = authData.user?.id;
  if (!me) throw new Error('not_authenticated');
  const kinds = opts.kinds ?? ['match_waiting'];
  rememberWaitingDismissed(me, {
    notificationId: opts.notificationId,
    actorId: kinds.includes('match_waiting') ? opts.actorId : null,
  });

  let query = supabase
    .from('social_notifications')
    .update({
      read_at: new Date().toISOString(),
      body: DECLINED_DISMISSED_BODY,
    })
    .eq('user_id', me)
    .in('kind', kinds);
  if (opts.actorId) query = query.eq('actor_id', opts.actorId);
  else if (opts.notificationId) query = query.eq('id', opts.notificationId);
  await query.select('id');

  if (opts.notificationId) {
    try {
      await markSocialNotificationRead(opts.notificationId);
    } catch {
      /* déjà lue */
    }
  }
  emitInboxUpdated({
    actorId: opts.actorId ?? undefined,
    decision: 'wait-dismiss',
    notificationId: opts.notificationId ?? null,
  });
}
