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

/**
 * Date d’entrée dans « 1er mot » : confirmation du match, pas le like/flash reçu.
 * accepted (couronne) → inbox.updated_at / like renvoyé ; initiated → acceptation de l’autre.
 */
export function firstWordEventIso({
  matchRole,
  dateReceived,
  matchedAt,
  matchedBackAt,
  inboxMatchedAt,
}: {
  matchRole: 'accepted' | 'initiated';
  dateReceived: string;
  matchedAt: string;
  matchedBackAt: string | null;
  inboxMatchedAt?: string | null;
}): string {
  if (inboxMatchedAt) return inboxMatchedAt;
  if (matchRole === 'accepted') {
    return matchedBackAt || matchedAt || dateReceived;
  }
  return matchedAt || dateReceived || matchedBackAt || '';
}

export function inboxMatchAtByActor(
  rows: { actor_id: string; decision: string; updated_at?: string | null }[]
): Map<string, string> {
  const next = new Map<string, string>();
  for (const row of rows) {
    if (row.decision === 'match' && row.actor_id && row.updated_at) {
      next.set(row.actor_id, row.updated_at);
    }
  }
  return next;
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

export type InterestSender = 'me' | 'them' | 'unknown';
export type InterestOrigin = 'like' | 'flash';

/** Qui a envoyé le premier geste daté, et quand l’autre a répondu. */
export type InterestExchange = {
  sender: InterestSender;
  origin: InterestOrigin | null;
  sentAt: string | null;
  acceptedAt: string | null;
};

function parsedTime(iso?: string | null): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

function earlierGesture(
  likeAt?: string | null,
  flashAt?: string | null
): { origin: InterestOrigin; at: string; time: number } | null {
  const like = parsedTime(likeAt);
  const flash = parsedTime(flashAt);
  if (like == null && flash == null) return null;
  if (flash == null || (like != null && like <= flash)) {
    return { origin: 'like', at: likeAt as string, time: like as number };
  }
  return { origin: 'flash', at: flashAt as string, time: flash };
}

/**
 * Deux dates strictement ordonnées : le plus tôt a envoyé, le plus tard a accepté.
 * Dates absentes ou identiques : personne n’est désigné.
 */
export function resolveInterestExchange(input: {
  myLikeAt?: string | null;
  myFlashAt?: string | null;
  theirLikeAt?: string | null;
  theirFlashAt?: string | null;
}): InterestExchange {
  const mine = earlierGesture(input.myLikeAt, input.myFlashAt);
  const theirs = earlierGesture(input.theirLikeAt, input.theirFlashAt);
  if (mine && theirs) {
    if (mine.time === theirs.time) {
      return {
        sender: 'unknown',
        origin: null,
        sentAt: null,
        acceptedAt: mine.at,
      };
    }
    if (mine.time < theirs.time) {
      return {
        sender: 'me',
        origin: mine.origin,
        sentAt: mine.at,
        acceptedAt: theirs.at,
      };
    }
    return {
      sender: 'them',
      origin: theirs.origin,
      sentAt: theirs.at,
      acceptedAt: mine.at,
    };
  }
  if (theirs) {
    return {
      sender: 'them',
      origin: theirs.origin,
      sentAt: theirs.at,
      acceptedAt: null,
    };
  }
  if (mine) {
    return {
      sender: 'me',
      origin: mine.origin,
      sentAt: mine.at,
      acceptedAt: null,
    };
  }
  return { sender: 'unknown', origin: null, sentAt: null, acceptedAt: null };
}

/**
 * Match : les deux côtés datés sont requis, sinon une seule date de match.
 * À étudier / attente : seul leur geste daté compte.
 */
export function exchangeForMatchCard(
  kind: 'match' | 'like' | 'flash',
  raw: {
    myLikeAt?: string | null;
    myFlashAt?: string | null;
    theirLikeAt?: string | null;
    theirFlashAt?: string | null;
  },
  fallbackMatchIso?: string | null
): InterestExchange {
  const ex = resolveInterestExchange(raw);
  const hasMine = Boolean(earlierGesture(raw.myLikeAt, raw.myFlashAt));
  const hasTheirs = Boolean(earlierGesture(raw.theirLikeAt, raw.theirFlashAt));
  if (kind === 'match') {
    if (hasMine && hasTheirs) return ex;
    return {
      sender: 'unknown',
      origin: null,
      sentAt: null,
      acceptedAt: fallbackMatchIso || ex.acceptedAt || ex.sentAt,
    };
  }
  if (hasTheirs) {
    return {
      sender: 'them',
      origin: ex.origin,
      sentAt: ex.sentAt,
      acceptedAt: null,
    };
  }
  return { sender: 'unknown', origin: null, sentAt: null, acceptedAt: null };
}

type GestureRow = { created_at: string; to_user?: string; from_user?: string };

function earliestGestureAt(rows: GestureRow[], peerId: string, key: 'to_user' | 'from_user'): string | null {
  let best: string | null = null;
  let bestTime = Infinity;
  for (const row of rows) {
    if (row[key] !== peerId) continue;
    const time = parsedTime(row.created_at);
    if (time == null || time >= bestTime) continue;
    bestTime = time;
    best = row.created_at;
  }
  return best;
}

/** Date réelle du Like ou du Flash encore en base. Absente : null, sans date de remplacement. */
export function peerGestureAt(
  edges: {
    sentLikes: GestureRow[];
    receivedLikes: GestureRow[];
    receivedFlashes: GestureRow[];
    sentFlashes: GestureRow[];
  },
  peerId: string,
  origin: InterestOrigin,
  direction: 'sent' | 'received'
): string | null {
  if (direction === 'sent') {
    const rows = origin === 'flash' ? edges.sentFlashes : edges.sentLikes;
    return earliestGestureAt(rows, peerId, 'to_user');
  }
  const rows = origin === 'flash' ? edges.receivedFlashes : edges.receivedLikes;
  return earliestGestureAt(rows, peerId, 'from_user');
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

/** Décision inbox `match` (couronne) : le profil n’est plus « à étudier ». */
export function matchIdsIncludingInboxDecisions(
  edgeMatchIds: Iterable<string>,
  inboxRows: { actor_id: string; decision: string }[]
): Set<string> {
  const next = new Set(edgeMatchIds);
  for (const row of inboxRows) {
    if (row.decision === 'match' && row.actor_id) next.add(row.actor_id);
  }
  return next;
}

export function isMatchedBoardPeer(peer: {
  kind?: string;
  alreadyLiked?: boolean;
}): boolean {
  return peer.kind === 'match' || Boolean(peer.alreadyLiked);
}

/** Match réciproque encore actif : 1er mot ou discussion, jamais un like seul. */
export function isLiveReciprocalMatch(peer: {
  kind?: string;
  alreadyLiked?: boolean;
  waiting?: boolean;
}): boolean {
  return !peer.waiting && isMatchedBoardPeer(peer);
}

/** Compte les matchs (like/flash réciproques), pas les discussions en cours. */
export function countReciprocalMatches<
  T extends {
    profile: { id: string };
    kind?: string;
    alreadyLiked?: boolean;
    waiting?: boolean;
  },
>(peers: T[], brokenPeerIds: Set<string> = new Set()): number {
  let count = 0;
  for (const peer of dedupePeersByCanonicalStatus(peers)) {
    if (brokenPeerIds.has(peer.profile.id)) continue;
    if (isLiveReciprocalMatch(peer)) count += 1;
  }
  return count;
}

/** Matchs actifs pas encore vus par le membre. La pastille, elle, compte aussi les vus. */
export function countUnseenMatches<
  T extends {
    profile: { id: string };
    kind?: string;
    alreadyLiked?: boolean;
    waiting?: boolean;
  },
>(
  matches: T[],
  seenPeerIds: ReadonlySet<string>,
  brokenPeerIds: ReadonlySet<string> = new Set()
): number {
  let count = 0;
  for (const match of dedupePeersByCanonicalStatus(matches)) {
    if (brokenPeerIds.has(match.profile.id)) continue;
    if (!isLiveReciprocalMatch(match)) continue;
    if (seenPeerIds.has(match.profile.id)) continue;
    count += 1;
  }
  return count;
}

/** Matchs encore dans la rubrique « 1er mot » : pas d’échange des deux côtés. */
export function countFirstWordMatches(
  matches: { kind?: string; profile: { id: string } }[],
  peersWithChat: ReadonlySet<string>
): number {
  let count = 0;
  for (const match of matches) {
    if (match.kind === 'match' && !peersWithChat.has(match.profile.id)) {
      count += 1;
    }
  }
  return count;
}

/** Sources brutes (likes/flashes/inbox/ruptures) pour le même total que le titre. */
export type LiveReciprocalMatchSources = {
  sentLikeIds?: Iterable<string>;
  receivedLikeIds?: Iterable<string>;
  sentFlashIds?: Iterable<string>;
  receivedFlashIds?: Iterable<string>;
  inboxRows?: { actor_id: string; decision: string }[];
  brokenPeerIds?: Iterable<string>;
};

/**
 * Matchs réciproques encore actifs : 1er mot + discussions.
 * Exclut à étudier, attente, refus, rompus et archivés.
 */
export function collectLiveReciprocalMatchIds(
  sources: LiveReciprocalMatchSources
): string[] {
  const sentLikes = new Set(sources.sentLikeIds ?? []);
  const receivedLikes = new Set(sources.receivedLikeIds ?? []);
  const sentFlashes = new Set(sources.sentFlashIds ?? []);
  const receivedFlashes = new Set(sources.receivedFlashIds ?? []);
  const broken = new Set(
    [...(sources.brokenPeerIds ?? [])].filter(Boolean)
  );
  const inboxRows = sources.inboxRows ?? [];
  const refused = new Set(
    inboxRows
      .filter((row) => row.decision === 'refuse' && row.actor_id)
      .map((row) => row.actor_id)
  );

  const edgeMatchIds = new Set<string>();
  for (const id of receivedLikes) {
    if (sentLikes.has(id) || sentFlashes.has(id)) edgeMatchIds.add(id);
  }
  for (const id of receivedFlashes) {
    if (sentLikes.has(id) || sentFlashes.has(id)) edgeMatchIds.add(id);
  }

  const live: string[] = [];
  for (const id of matchIdsIncludingInboxDecisions(edgeMatchIds, inboxRows)) {
    if (!id || broken.has(id) || refused.has(id)) continue;
    live.push(id);
  }
  return live;
}

export function collectMatchedPeerIds<
  T extends {
    profile: { id: string };
    kind?: string;
    alreadyLiked?: boolean;
  },
>(peers: T[]): Set<string> {
  const next = new Set<string>();
  for (const peer of peers) {
    if (isMatchedBoardPeer(peer)) next.add(peer.profile.id);
  }
  return next;
}

export function withoutOccupiedPeers<T>(
  items: T[],
  occupiedIds: ReadonlySet<string>,
  getId: (item: T) => string
): T[] {
  if (occupiedIds.size === 0 || items.length === 0) return items;
  return items.filter((item) => !occupiedIds.has(getId(item)));
}

/** Une seule fiche par profil : match > attente > à étudier. */
export function dedupePeersByCanonicalStatus<
  T extends {
    profile: { id: string };
    kind?: string;
    alreadyLiked?: boolean;
    waiting?: boolean;
  },
>(peers: T[]): T[] {
  const rank = (peer: T) => {
    if (isMatchedBoardPeer(peer)) return 3;
    if (peer.waiting) return 2;
    return 1;
  };
  const byId = new Map<string, T>();
  for (const peer of peers) {
    const id = peer.profile.id;
    const prev = byId.get(id);
    if (!prev || rank(peer) >= rank(prev)) byId.set(id, peer);
  }
  return [...byId.values()];
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
