import type { MatchPulseCategory } from '@/lib/pendingStudy';

/** Options de navigation vers Mes Matchs depuis la cloche / Accueil. */
export type OpenMatchesOpts =
  | boolean
  | {
      openChat?: boolean;
      /**
       * Rappel Attendre : surbrille une carte, scroll, ouvre la fiche.
       */
      highlight?: boolean;
      /** Prénom extrait du libellé notif (secours si actor_id ambigu). */
      hintName?: string | null;
      /**
       * Clignotement exclusif d’une catégorie (A = new, B = wait).
       * Remplace tout clignotement précédent.
       */
      pulseCategory?: MatchPulseCategory | null;
      /** Ouvre l’espace « Pas cette fois » (archiver / supprimer). */
      declined?: boolean;
      /**
       * Notif « X a mis ton Like/Flash en attente » :
       * ouvre la fiche de ce membre (pas dans notre liste d’attente).
       */
      waitingIncoming?: boolean;
      /**
       * Profils du digest cloche : à épingler en tête de la rubrique Mes Matchs.
       */
      pinActorIds?: string[];
      /**
       * Récap messages non lus : ouvre Mes Matchs, conversations en tête.
       * Un seul expéditeur → openChat (opts === true).
       */
      unreadMailbox?: boolean;
      /** @deprecated Utiliser pulseCategory: 'new' */
      pulsePendingAll?: boolean;
    };

export function normalizeOpenMatchesOpts(opts?: OpenMatchesOpts): {
  openChat: boolean;
  highlight: boolean;
  hintName: string | null;
  pulseCategory: MatchPulseCategory | null;
  declined: boolean;
  waitingIncoming: boolean;
  pinActorIds: string[];
  unreadMailbox: boolean;
} {
  if (opts === true) {
    return {
      openChat: true,
      highlight: false,
      hintName: null,
      pulseCategory: null,
      declined: false,
      waitingIncoming: false,
      pinActorIds: [],
      unreadMailbox: false,
    };
  }
  if (!opts) {
    return {
      openChat: false,
      highlight: false,
      hintName: null,
      pulseCategory: null,
      declined: false,
      waitingIncoming: false,
      pinActorIds: [],
      unreadMailbox: false,
    };
  }
  const pulseCategory: MatchPulseCategory | null =
    opts.pulseCategory === 'new' ||
    opts.pulseCategory === 'wait' ||
    opts.pulseCategory === 'first'
      ? opts.pulseCategory
      : opts.pulsePendingAll
        ? 'new'
        : null;
  return {
    openChat: Boolean(opts.openChat),
    highlight: Boolean(opts.highlight),
    hintName: opts.hintName?.trim() || null,
    pulseCategory,
    declined: Boolean(opts.declined),
    waitingIncoming: Boolean(opts.waitingIncoming),
    pinActorIds: [...new Set((opts.pinActorIds || []).filter(Boolean))],
    unreadMailbox: Boolean(opts.unreadMailbox),
  };
}

export function uniquePinIds(ids: string[]): string[] {
  return [...new Set((ids || []).filter(Boolean))];
}

/** Clic digest cloche → Mes Matchs, profils du texte épinglés en tête. */
export function openDigestOpts(
  category: MatchPulseCategory,
  pinActorIds: string[]
): Exclude<OpenMatchesOpts, boolean> {
  return {
    pulseCategory: category,
    pinActorIds: uniquePinIds(pinActorIds),
  };
}

/** Clic Like/Flash individuel → même étage + pin de cette fiche. */
export function openLikeOpts(
  actorId: string,
  category: Exclude<MatchPulseCategory, 'first'> = 'new'
): Exclude<OpenMatchesOpts, boolean> {
  return {
    pulseCategory: category,
    pinActorIds: actorId ? [actorId] : [],
  };
}

export function likeFloorForActor(
  actorId: string,
  waitIds: Iterable<string>
): Exclude<MatchPulseCategory, 'first'> {
  if (!actorId) return 'new';
  return new Set(waitIds).has(actorId) ? 'wait' : 'new';
}

export function digestPinIdsFromEntries(
  entries: { id: string; status: string }[],
  category: MatchPulseCategory,
  archivedWaitIds: Iterable<string> = []
): string[] {
  const archived = new Set(archivedWaitIds);
  if (category === 'new') {
    return entries.filter((e) => e.status === 'new').map((e) => e.id);
  }
  if (category === 'wait') {
    return entries
      .filter((e) => e.status === 'wait' && !archived.has(e.id))
      .map((e) => e.id);
  }
  return entries.filter((e) => e.status === 'matched').map((e) => e.id);
}

/** Retire les profils déjà visités (fiche / conversation) d’un digest nommé. */
export function omitVisitedDigestIds(
  ids: readonly string[],
  visited: Iterable<string>
): string[] {
  const skip = new Set(
    [...visited].filter((id): id is string => Boolean(id))
  );
  if (skip.size === 0) return [...ids];
  return ids.filter((id) => Boolean(id) && !skip.has(id));
}

/** Expéditeurs avec au moins un message non lu (case « Tu as X messages non lus »). */
export function unreadMessageSenderIds(
  unreadBySender: Record<string, number>
): string[] {
  return uniqueNonEmptyIds(
    Object.entries(unreadBySender)
      .filter(([, n]) => n > 0)
      .map(([id]) => id)
  );
}

/**
 * Priorité à la rubrique messages : un profil déjà dans les non lus
 * ne reste pas dans « 1er mot » ni « En attente ».
 */
export function omitUnreadMessageSenders(
  ids: readonly string[],
  unreadBySender: Record<string, number>
): string[] {
  return omitVisitedDigestIds(ids, unreadMessageSenderIds(unreadBySender));
}

/** Récap « ces X ci-dessus » en bas du bloc, comme À découvrir. */
export function digestRecapSort(aIsRecap: boolean, bIsRecap: boolean): number {
  return Number(aIsRecap) - Number(bIsRecap);
}

export function uniqueNonEmptyIds(
  ids: Iterable<string | null | undefined>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Rubrique « stock + nouveautés » (À découvrir, En attente, 1er mot, …).
 * `memberIds` = profils actuellement dans la rubrique.
 * `freshIds` = profils entrés après la dernière consultation de la cloche
 * (jamais un Like/match_created non lu : ces events restent non lus).
 */
export type BellRubricTally = {
  memberIds: readonly string[];
  freshIds: readonly string[];
};

/**
 * +1 si au moins un ancien (membre hors nouveautés), +1 par nouveau.
 * 2 ou 20 anciens = toujours 1. Chaque nouveauté compte à part.
 */
export function bellRubricPoints(tally: BellRubricTally): number {
  const fresh = uniqueNonEmptyIds(tally.freshIds);
  const freshSet = new Set(fresh);
  const hasStock = uniqueNonEmptyIds(tally.memberIds).some(
    (id) => !freshSet.has(id)
  );
  return (hasStock ? 1 : 0) + fresh.length;
}

export function collectUnreadActorIds(
  items: readonly {
    kind: string;
    actor_id?: string | null;
    read_at?: string | null;
  }[],
  kinds: readonly string[]
): string[] {
  const kindSet = new Set(kinds);
  return uniqueNonEmptyIds(
    items
      .filter((n) => !n.read_at && kindSet.has(n.kind))
      .map((n) => n.actor_id)
  );
}

/**
 * Kinds de notif non lue = « vient d’entrer » dans la rubrique.
 * Attente : pas d’événement inbound (c’est une action locale) → tableau vide,
 * les ids passent par `sessionEnteredIds`.
 */
export const BELL_RUBRIC_UNREAD_KINDS: Record<string, readonly string[]> = {
  new: ['like_received', 'flash_received'],
  wait: [],
  first: ['match_created'],
  declined: ['match_declined'],
  waitOther: ['match_waiting'],
};

/** Nouveautés d’une rubrique : événements non lus ∪ entrées de session. */
export function bellRubricFreshIds(input: {
  unreadItems: readonly {
    kind: string;
    actor_id?: string | null;
    read_at?: string | null;
  }[];
  unreadKinds: readonly string[];
  sessionEnteredIds?: Iterable<string>;
  excludeIds?: Iterable<string>;
}): string[] {
  const exclude = new Set(
    [...(input.excludeIds || [])].filter((id): id is string => Boolean(id))
  );
  return uniqueNonEmptyIds([
    ...collectUnreadActorIds(input.unreadItems, input.unreadKinds),
    ...(input.sessionEnteredIds || []),
  ]).filter((id) => !exclude.has(id));
}

/**
 * Premier instantané d’une rubrique = stock (pas des « nouveaux »).
 * Les ids apparus ensuite = nouveautés (+1 chacune) jusqu’à la prochaine
 * ouverture de cloche (`absorbRubricConsultation`) ou jusqu’à disparaitre.
 */
export type RubricMemberBaseline = {
  primed: boolean;
  seen: Set<string>;
};

export function emptyRubricBaseline(): RubricMemberBaseline {
  return { primed: false, seen: new Set() };
}

export function rubricSeenStorageKey(userId: string, rubric: string): string {
  return `aypik-bell-seen:${userId}:${rubric}`;
}

export function readRubricBaseline(
  userId: string,
  rubric: string
): RubricMemberBaseline {
  if (typeof sessionStorage === 'undefined') return emptyRubricBaseline();
  try {
    const raw = sessionStorage.getItem(rubricSeenStorageKey(userId, rubric));
    if (!raw) return emptyRubricBaseline();
    const ids = JSON.parse(raw) as unknown;
    if (!Array.isArray(ids)) return emptyRubricBaseline();
    return {
      primed: true,
      seen: new Set(
        ids.filter((id): id is string => typeof id === 'string' && Boolean(id))
      ),
    };
  } catch {
    return emptyRubricBaseline();
  }
}

export function writeRubricBaseline(
  userId: string,
  rubric: string,
  baseline: RubricMemberBaseline
): void {
  if (!baseline.primed || typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(
    rubricSeenStorageKey(userId, rubric),
    JSON.stringify([...baseline.seen])
  );
}

/** Ouvrir la cloche : le paquet actuel redevient du stock (plus des nouveautés). */
export function absorbRubricConsultation(
  baseline: RubricMemberBaseline,
  memberIds: readonly string[]
): void {
  const members = uniqueNonEmptyIds(memberIds);
  if (members.length === 0 && !baseline.primed) return;
  baseline.primed = true;
  baseline.seen = new Set(members);
}

export function observeRubricMembers(
  baseline: RubricMemberBaseline,
  memberIds: readonly string[],
  ready = true
): { stockIds: string[]; freshIds: string[] } {
  const members = uniqueNonEmptyIds(memberIds);
  if (!ready) {
    return { stockIds: [], freshIds: [] };
  }
  if (!baseline.primed) {
    /* Liste vide = chargement, pas un stock réel : ne pas figer « tout est nouveau ». */
    if (members.length === 0) {
      return { stockIds: [], freshIds: [] };
    }
    baseline.primed = true;
    baseline.seen = new Set(members);
    return { stockIds: members, freshIds: [] };
  }
  const memberSet = new Set(members);
  for (const id of [...baseline.seen]) {
    if (!memberSet.has(id)) baseline.seen.delete(id);
  }
  return {
    stockIds: members.filter((id) => baseline.seen.has(id)),
    freshIds: members.filter((id) => !baseline.seen.has(id)),
  };
}

/**
 * Chiffre de la cloche : une case du panneau = 1, même si le texte
 * mentionne une quantité (« 6 messages non lus »).
 */
export function bellPanelCardCount(
  blocks: readonly { rows: readonly unknown[] }[]
): number {
  let total = 0;
  for (const block of blocks) total += block.rows.length;
  return total;
}

/**
 * Ancien tally par rubrique (stock + nouveautés). Le badge UI utilise
 * `bellPanelCardCount` (1 par case affichée).
 */
export function bellHeaderBadgeCount(input: {
  rubrics: readonly BellRubricTally[];
  unreadMessageCount: number;
}): number {
  let total = 0;
  for (const rubric of input.rubrics) {
    total += bellRubricPoints(rubric);
  }
  if (input.unreadMessageCount > 0) total += 1;
  return total;
}

export function socialLikeInDiscoverSet(
  actorId: string | null | undefined,
  newIds: string[],
  waitIds: Iterable<string> = []
): boolean {
  if (!actorId) return false;
  if (newIds.length > 0) return newIds.includes(actorId);
  return !new Set(waitIds).has(actorId);
}

/** Décisions déjà prises cette session : un publish/serveur en retard ne les écrase pas. */
export type InboxSticky = {
  matched: ReadonlySet<string>;
  refused: ReadonlySet<string>;
  wait: ReadonlySet<string>;
};

export function mergeInboxPublish<T extends { id: string; status: string }>(
  next: T[],
  sticky: InboxSticky
): T[] {
  return next
    .filter((e) => !sticky.refused.has(e.id))
    .map((e) => {
      if (sticky.matched.has(e.id)) {
        const status = e.status === 'matched-chat' ? 'matched-chat' : 'matched';
        return { ...e, status };
      }
      if (sticky.wait.has(e.id) && e.status === 'new') {
        return { ...e, status: 'wait' };
      }
      return e;
    });
}

export function filterServerDigestIds(
  ids: string[],
  sticky: InboxSticky,
  as: 'new' | 'wait'
): string[] {
  return (ids || []).filter((id) => {
    if (!id) return false;
    if (sticky.refused.has(id) || sticky.matched.has(id)) return false;
    if (as === 'new' && sticky.wait.has(id)) return false;
    return true;
  });
}

/**
 * Texte + pin + badge d’un digest : même liste.
 * Snapshot Mes Matchs ∩ compteur serveur (tous deux filtrés sticky).
 * Sans ça, un snapshot figé au 1er passage sur Mes Matchs continue
 * d’annoncer « ces 2 personnes » alors que le serveur (et le badge) ont déjà 1.
 */
export function selectLiveDigestIds(input: {
  snapshotIds: readonly string[];
  serverIds: readonly string[];
  sticky: InboxSticky;
  as: 'new' | 'wait';
  snapshotReady: boolean;
  serverReady: boolean;
}): string[] {
  const snap = filterServerDigestIds(
    [...input.snapshotIds],
    input.sticky,
    input.as
  );
  const srv = filterServerDigestIds(
    [...input.serverIds],
    input.sticky,
    input.as
  );
  if (input.snapshotReady && input.serverReady) {
    const srvSet = new Set(srv);
    return snap.filter((id) => srvSet.has(id));
  }
  if (input.snapshotReady) return snap;
  return srv;
}
