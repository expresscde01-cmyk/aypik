import type { Profile, ProfileGender } from '@/components/ProfileSetup';
import { isWithinAgeGap, MIN_USER_AGE, profileCardAge } from '@/lib/dating';
import { fetchMyProfile } from '@/lib/myProfile';
import { queryLikeFlashEdges } from '@/lib/likeFlashEdges';
import { fetchSocialNotifications } from '@/lib/suggestions';
import { fetchPeerDialogueFlags } from '@/lib/messaging';
import { fetchInboxResponses, fetchPendingByOthers } from '@/lib/inboxResponses';
import {
  dropConfirmedInboxDecisionsSeenIn,
  hasConfirmedInboxDecisions,
  mergeConfirmedInboxDecisions,
} from '@/lib/inboxDecisionOverlay';
import {
  inboxMatchAtByActor,
  isMatchedViaWait,
  matchIdsIncludingInboxDecisions,
  splitPendingByOthers,
} from '@/lib/matchHistoryDisplay';
import { matchRoleFromDates, type MatchRole } from '@/lib/interactionCopy';
import { fetchProfileBundle } from '@/lib/profileBundle';
import {
  isWaitCleared,
  retainMineWaitArchives,
  retainTheirsWaitArchives,
} from '@/lib/waitArchives';

export type MatchKind = 'match' | 'flash' | 'like';
export type ReceivedOrigin = 'flash' | 'like';

export interface Match {
  profile: Profile;
  age: number;
  date_received: string;
  matched_at: string;
  kind: MatchKind;
  origin: ReceivedOrigin;
  matchedBackAt: string | null;
  alreadyLiked: boolean;
  matchRole: MatchRole;
  waiting: boolean;
  waitingAt: string | null;
  refused: boolean;
  matchedViaWait: boolean;
  is_founder?: boolean;
  founder_number?: number | null;
  is_boosted?: boolean;
}

export type WaitPrune = {
  inboxOk: boolean;
  pendingOthersOk: boolean;
  waitingActors: Set<string>;
  liveWaitPeerIds: Set<string>;
};

export type MatchesBoardLoad = {
  matches: Match[];
  peersWithChat: Set<string>;
  peersIWroteTo: Set<string>;
  myGender: ProfileGender | null;
  waitPrune: WaitPrune | null;
};

function earliestIso(...values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestTime = Infinity;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isFinite(time) || time >= bestTime) continue;
    bestTime = time;
    best = value;
  }
  return best;
}

function isInboxEligible(myAge: number | null, theirAge: number): boolean {
  if (!Number.isFinite(theirAge) || theirAge < MIN_USER_AGE) return false;
  if (typeof myAge !== 'number' || !Number.isFinite(myAge)) return true;
  if (myAge < MIN_USER_AGE) return false;
  return isWithinAgeGap(myAge, theirAge);
}

/** Même assemblage que l’ancien loadMatches de Mes Matchs, sans monter la page. */
export async function loadMatchesBoard(input: {
  userId: string;
  departingIds: ReadonlySet<string>;
  forceWait: Set<string>;
  extraTwoWay: Iterable<string>;
  extraWrote: Iterable<string>;
}): Promise<MatchesBoardLoad> {
  const { userId, departingIds, forceWait } = input;
  const { data: meRow } = await fetchMyProfile();
  const myAge =
    typeof meRow?.age === 'number' && Number.isFinite(meRow.age)
      ? meRow.age
      : null;
  const genderRaw = meRow?.gender;
  const myGender: ProfileGender | null =
    genderRaw === 'homme' || genderRaw === 'femme' ? genderRaw : null;

  const edges = await queryLikeFlashEdges(
    userId,
    hasConfirmedInboxDecisions() ? { staleTime: 0 } : undefined
  );
  const sentLikes = edges.sentLikes || [];
  const receivedLikes = [...(edges.receivedLikes || [])];
  const incomingFlashes = [...(edges.receivedFlashes || [])];
  const outgoingFlashMap = new Map(
    (edges.sentFlashes || []).map((f) => [f.to_user, f.created_at])
  );
  const sentSet = new Set(sentLikes.map((l) => l.to_user));
  const sentMap = new Map(sentLikes.map((l) => [l.to_user, l.created_at]));

  try {
    const notifs = await fetchSocialNotifications(50);
    for (const n of notifs) {
      const actorId = n.actor_id;
      if (!actorId) continue;
      if (n.kind === 'flash_received') {
        if (!incomingFlashes.some((f) => f.from_user === actorId)) {
          incomingFlashes.push({ from_user: actorId, created_at: n.created_at });
        }
      } else if (
        n.kind === 'like_received' ||
        n.kind === 'match_created' ||
        /nouveau like/i.test(n.title) ||
        /envoyé un like/i.test(n.body)
      ) {
        if (!receivedLikes.some((l) => l.from_user === actorId)) {
          receivedLikes.push({ from_user: actorId, created_at: n.created_at });
        }
      }
    }
  } catch {
    /* likes / flashes restent la source principale */
  }

  let inboxRes: Awaited<ReturnType<typeof fetchInboxResponses>> = [];
  let inboxOk = false;
  try {
    inboxRes = await fetchInboxResponses();
    inboxOk = true;
  } catch {
    try {
      inboxRes = await fetchInboxResponses();
      inboxOk = true;
    } catch {
      inboxRes = [];
    }
  }
  const inboxSnapshot = inboxRes;
  inboxRes = mergeConfirmedInboxDecisions(inboxRes);
  if (inboxOk) {
    dropConfirmedInboxDecisionsSeenIn(
      inboxSnapshot.filter((row) => !departingIds.has(row.actor_id))
    );
  }

  const incomingFlashMap = new Map(
    incomingFlashes.map((f) => [f.from_user, f.created_at])
  );
  const receivedLikeMap = new Map(
    receivedLikes.map((rl) => [rl.from_user, rl.created_at])
  );
  const originOf = (id: string): { origin: ReceivedOrigin; at: string } => {
    const flashAt = incomingFlashMap.get(id);
    if (flashAt) return { origin: 'flash', at: flashAt };
    return { origin: 'like', at: receivedLikeMap.get(id) || '' };
  };
  const myFirstAt = (id: string): string | null =>
    earliestIso(sentMap.get(id), outgoingFlashMap.get(id));
  const theirFirstAt = (id: string): string | null =>
    earliestIso(incomingFlashMap.get(id), receivedLikeMap.get(id));

  const matchEntries: {
    id: string;
    at: string;
    origin: ReceivedOrigin;
    matchedBackAt: string;
    matchRole: MatchRole;
  }[] = receivedLikes
    .filter(
      (rl) => sentSet.has(rl.from_user) || outgoingFlashMap.has(rl.from_user)
    )
    .map((rl) => {
      const src = originOf(rl.from_user);
      const mine = myFirstAt(rl.from_user);
      const theirs = theirFirstAt(rl.from_user) || src.at || rl.created_at;
      return {
        id: rl.from_user,
        at: theirs,
        origin: src.origin,
        matchedBackAt: mine || rl.created_at,
        matchRole: matchRoleFromDates(mine, theirs),
      };
    });
  const matchIdSet = new Set(matchEntries.map((m) => m.id));

  for (const f of incomingFlashes) {
    if (
      matchIdSet.has(f.from_user) ||
      (!sentSet.has(f.from_user) && !outgoingFlashMap.has(f.from_user))
    ) {
      continue;
    }
    const mine = myFirstAt(f.from_user);
    matchEntries.push({
      id: f.from_user,
      at: f.created_at,
      origin: 'flash',
      matchedBackAt: mine || f.created_at,
      matchRole: matchRoleFromDates(mine, f.created_at),
    });
    matchIdSet.add(f.from_user);
  }

  for (const id of matchIdsIncludingInboxDecisions([], inboxRes)) {
    matchIdSet.add(id);
  }

  const flashEntries = incomingFlashes
    .filter((f) => !matchIdSet.has(f.from_user))
    .map((f) => ({ id: f.from_user, at: f.created_at }));
  const flashIdSet = new Set(flashEntries.map((f) => f.id));
  const likeEntries = receivedLikes
    .filter((rl) => !matchIdSet.has(rl.from_user) && !flashIdSet.has(rl.from_user))
    .map((rl) => ({ id: rl.from_user, at: rl.created_at }));
  const allIds = [
    ...new Set([
      ...matchEntries.map((m) => m.id),
      ...flashEntries.map((f) => f.id),
      ...likeEntries.map((l) => l.id),
      ...matchIdSet,
    ]),
  ];

  const refusedActors = new Set(
    inboxRes.filter((r) => r.decision === 'refuse').map((r) => r.actor_id)
  );
  const waitingAtMap = new Map(
    inboxRes
      .filter((r) => r.decision === 'wait')
      .map((r) => [r.actor_id, r.updated_at] as const)
  );
  const waitingActors = new Set(waitingAtMap.keys());
  let matchedViaWaitPeerIds = new Set<string>();
  let liveWaitPeerIds = new Set<string>();
  let pendingOthersOk = false;
  try {
    const pendingOthers = await fetchPendingByOthers();
    const split = splitPendingByOthers(pendingOthers);
    matchedViaWaitPeerIds = split.matchedViaWaitPeerIds;
    liveWaitPeerIds = new Set(split.liveWaits.map((row) => row.peer_id));
    pendingOthersOk = true;
  } catch {
    matchedViaWaitPeerIds = new Set();
  }
  const viaWaitOwn = new Set(
    inboxRes
      .filter((r) => r.decision === 'match' && isMatchedViaWait(r.wait_started_at))
      .map((r) => r.actor_id)
  );
  const inboxMatchAtMap = inboxMatchAtByActor(inboxRes);
  if (inboxOk) retainMineWaitArchives(userId, waitingActors);
  if (pendingOthersOk) retainTheirsWaitArchives(userId, liveWaitPeerIds);

  const waitPrune: WaitPrune | null =
    inboxOk || pendingOthersOk
      ? { inboxOk, pendingOthersOk, waitingActors, liveWaitPeerIds }
      : null;

  if (allIds.length === 0) {
    return {
      matches: [],
      peersWithChat: new Set(input.extraTwoWay),
      peersIWroteTo: new Set(input.extraWrote),
      myGender,
      waitPrune,
    };
  }

  const { byId, founderMap, boostSet } = await fetchProfileBundle(allIds);
  const matchAt = new Map(matchEntries.map((m) => [m.id, m.at]));
  const matchOrigin = new Map(matchEntries.map((m) => [m.id, m.origin]));
  const matchBackAt = new Map(matchEntries.map((m) => [m.id, m.matchedBackAt]));
  const matchRoleMap = new Map(matchEntries.map((m) => [m.id, m.matchRole]));
  const flashAt = new Map(flashEntries.map((f) => [f.id, f.at]));
  const likeAt = new Map(likeEntries.map((l) => [l.id, l.at]));

  const flags = await fetchPeerDialogueFlags();
  const peersChat = new Set(flags.twoWay);
  const wroteFromMe = new Set(flags.wroteFromMe);
  for (const id of input.extraTwoWay) peersChat.add(id);
  for (const id of input.extraWrote) wroteFromMe.add(id);

  const matches = [...byId.values()]
    .map((p) => {
      const kind: MatchKind = matchIdSet.has(p.id)
        ? 'match'
        : flashIdSet.has(p.id)
          ? 'flash'
          : 'like';
      const src = originOf(p.id);
      const origin: ReceivedOrigin =
        src.origin === 'flash' ||
        matchOrigin.get(p.id) === 'flash' ||
        incomingFlashMap.has(p.id)
          ? 'flash'
          : 'like';
      const at =
        origin === 'flash'
          ? incomingFlashMap.get(p.id) || matchAt.get(p.id) || flashAt.get(p.id)
          : likeAt.get(p.id) || matchAt.get(p.id) || src.at;
      const mine = myFirstAt(p.id);
      const theirs = theirFirstAt(p.id) || at;
      const isMatched = kind === 'match';
      const waiting =
        !isMatched &&
        (forceWait.has(p.id) ||
          (waitingActors.has(p.id) && !isWaitCleared(userId, p.id)));
      const inboxMatchAt = inboxMatchAtMap.get(p.id) || null;
      const outgoingAt = matchBackAt.get(p.id) || mine || null;
      return {
        profile: p,
        age: profileCardAge(p),
        date_received: at || '',
        matched_at: at || '',
        kind,
        origin,
        matchedBackAt: isMatched ? inboxMatchAt || outgoingAt : outgoingAt,
        alreadyLiked:
          sentSet.has(p.id) || outgoingFlashMap.has(p.id) || matchIdSet.has(p.id),
        matchRole: matchRoleMap.get(p.id) || matchRoleFromDates(mine, theirs),
        waiting,
        waitingAt: waiting ? waitingAtMap.get(p.id) ?? null : null,
        refused: false,
        matchedViaWait:
          isMatched && (viaWaitOwn.has(p.id) || matchedViaWaitPeerIds.has(p.id)),
        is_founder: founderMap.has(p.id),
        founder_number: founderMap.get(p.id) ?? null,
        is_boosted: boostSet.has(p.id),
      };
    })
    .filter((m) => forceWait.has(m.profile.id) || !refusedActors.has(m.profile.id))
    .filter((m) => isInboxEligible(myAge, m.age))
    .sort((a, b) => {
      const ta = new Date(a.date_received).getTime() || 0;
      const tb = new Date(b.date_received).getTime() || 0;
      return tb - ta;
    });

  for (const m of matches) {
    if (waitingActors.has(m.profile.id)) forceWait.delete(m.profile.id);
  }

  return {
    matches,
    peersWithChat: peersChat,
    peersIWroteTo: wroteFromMe,
    myGender,
    waitPrune,
  };
}
