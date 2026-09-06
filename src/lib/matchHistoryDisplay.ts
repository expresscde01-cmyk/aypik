export type PendingByOtherDecision = 'wait' | 'refuse' | 'match';

export function isMatchedViaWait(
  waitStartedAt: string | null | undefined
): boolean {
  return Boolean(waitStartedAt && String(waitStartedAt).trim());
}

/** Liste « Mis en attente par l’autre » : uniquement decision wait (ou RPC sans colonne). */
export function isLiveWaitByOther(row: {
  decision?: string | null;
}): boolean {
  if (!row.decision) return true;
  return row.decision === 'wait';
}

export function splitPendingByOthers<
  T extends {
    peer_id: string;
    decision?: string | null;
    wait_started_at?: string | null;
  },
>(rows: T[]): { liveWaits: T[]; matchedViaWaitPeerIds: Set<string> } {
  const liveWaits = rows.filter(isLiveWaitByOther);
  const matchedViaWaitPeerIds = new Set(
    rows
      .filter(
        (row) =>
          row.decision === 'match' && isMatchedViaWait(row.wait_started_at)
      )
      .map((row) => row.peer_id)
  );
  return { liveWaits, matchedViaWaitPeerIds };
}

export function originHistoryIso({
  matchRole,
  dateReceived,
  matchedAt,
  matchedBackAt,
}: {
  matchRole: 'accepted' | 'initiated';
  dateReceived: string;
  matchedAt: string;
  matchedBackAt: string | null;
}): string {
  if (matchRole === 'initiated') {
    return matchedBackAt || dateReceived || matchedAt;
  }
  return dateReceived || matchedAt;
}

export function matchSheetViaWait(
  ownWaitStartedAt: string | null | undefined,
  peerWaitStartedAt: string | null | undefined
): boolean {
  return (
    isMatchedViaWait(ownWaitStartedAt) || isMatchedViaWait(peerWaitStartedAt)
  );
}

export function matchSheetUsesCrown(
  showMatched: boolean,
  viaWait: boolean
): boolean {
  return Boolean(showMatched && viaWait);
}

/** Les identifiants épinglés passent en tête, dans l’ordre du digest cloche. */
export function pinIdsFirst<T>(
  items: T[],
  pinnedIds: string[],
  getId: (item: T) => string
): T[] {
  if (pinnedIds.length === 0 || items.length === 0) return items;
  const rank = new Map(pinnedIds.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ia = rank.get(getId(a));
    const ib = rank.get(getId(b));
    const pa = ia !== undefined;
    const pb = ib !== undefined;
    if (pa && pb) return ia! - ib!;
    if (pa) return -1;
    if (pb) return 1;
    return 0;
  });
}

/** Retire une fiche du lot épinglé ; tableau inchangé si l’id n’y figurait pas. */
export function dropPinnedId(ids: string[], actorId: string): string[] {
  if (!actorId || ids.length === 0) return ids;
  const next = ids.filter((id) => id !== actorId);
  return next.length === ids.length ? ids : next;
}

type CategoryDigestState = {
  count: number;
  visible: boolean;
  ids: string[];
  soleId?: string | null;
  soleName?: string | null;
  soleOrigin?: string | null;
};

/** Une fiche traitée sort du digest : compteur et ids suivent, 0 → plus de « ci-dessus ». */
export function removeActorFromCategoryDigest<T extends CategoryDigestState>(
  prev: T | null,
  actorId: string
): T | null {
  if (!prev || !actorId) return prev;
  const hadIds = (prev.ids || []).length > 0;
  const ids = (prev.ids || []).filter((id) => id !== actorId);
  const wasListed =
    (prev.ids || []).includes(actorId) || prev.soleId === actorId;
  if (hadIds && !wasListed) return prev;
  const count = hadIds ? ids.length : Math.max(0, prev.count - 1);
  if (count <= 0) return null;
  const soleId = count === 1 ? ids[0] ?? prev.soleId ?? null : null;
  return {
    ...prev,
    ids,
    count,
    soleId,
    soleName:
      count === 1 && soleId && soleId === prev.soleId
        ? prev.soleName ?? null
        : null,
    soleOrigin:
      count === 1 && soleId && soleId === prev.soleId
        ? prev.soleOrigin ?? null
        : null,
  };
}
