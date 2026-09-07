import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, ChevronDown, Heart, MessageCircle, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  fetchPeerDialogueFlags,
  useInboxReload,
  useUnreadMessages,
} from '@/lib/messaging';
import type { InboxUpdatedDetail } from '@/lib/messaging';
import UnreadBadge, { unreadMessagesRecapCopy } from '@/components/UnreadBadge';
import {
  displaySocialNotification,
  fetchSocialNotifications,
  markAllSocialNotificationsRead,
  markSocialNotificationRead,
  sweepStaleSocialNotifications,
  type SocialNotification,
} from '@/lib/suggestions';
import { isDismissedDeclinedNotification } from '@/lib/declinedArchives';
import { isMineWaitArchived, isWaitingNoticeDismissed } from '@/lib/waitArchives';
import {
  categoryNotifSessionKey,
  categoryRingSessionKey,
  countInboxCategories,
  mergedNewProfileNotificationCopy,
  newProfilesNotificationCopy,
  waitingProfilesNotificationCopy,
  firstExchangeNotificationCopy,
  type MatchPulseCategory,
} from '@/lib/pendingStudy';
import { removeActorFromCategoryDigest } from '@/lib/matchHistoryDisplay';
import { useMatchesInboxSync } from '@/lib/matchesInboxSync';
import { withNotificationPeriod } from '@/lib/interactionCopy';
import {
  firstDigestTone,
  resolveDigestPeople,
  sliceDigestPeople,
} from '@/lib/digestCopy';
import {
  absorbRubricConsultation,
  bellPanelCardCount,
  BELL_RUBRIC_UNREAD_KINDS,
  collectUnreadActorIds,
  emptyRubricBaseline,
  observeRubricMembers,
  digestPinIdsFromEntries,
  digestRecapSort,
  filterServerDigestIds,
  likeFloorForActor,
  omitUnreadMessageSenders,
  omitVisitedDigestIds,
  openDigestOpts,
  openLikeOpts,
  readRubricBaseline,
  selectLiveDigestIds,
  socialLikeInDiscoverSet,
  writeRubricBaseline,
  type OpenMatchesOpts,
} from '@/lib/matchesNav';
import { placeNotifPanel, notifPanelViewport } from '@/lib/portaledActionTooltip';
import {
  ghostClickIgnoreUntil,
  shouldIgnoreBellClick,
} from '@/lib/bellGhostClick';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'À l’instant';
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days} j`;
}

function isInboxNotification(n: SocialNotification): boolean {
  return (
    n.kind === 'like_received' ||
    n.kind === 'flash_received' ||
    n.kind === 'match_created' ||
    n.kind === 'message_received' ||
    n.kind === 'match_waiting' ||
    n.kind === 'match_declined' ||
    n.kind === 'match_wait_reminder' ||
    n.kind === 'match_wait_expiry'
  );
}

/** Tons = blocs de couleur (haut → bas = hiérarchie figée). */
type NotifTone =
  | 'chat'
  | 'match'
  | 'wait'
  | 'wait-other'
  | 'new'
  | 'declined';

const TONE_HIERARCHY_TOP_TO_BOTTOM: NotifTone[] = [
  'chat',
  'match',
  'wait',
  'wait-other',
  'new',
  'declined',
];

function toneFromKind(
  kind: SocialNotification['kind'] | 'category_new' | 'category_wait' | 'messages'
): NotifTone {
  switch (kind) {
    case 'flash_received':
    case 'like_received':
    case 'category_new':
      return 'new';
    case 'match_wait_reminder':
    case 'match_wait_expiry':
    case 'category_wait':
      return 'wait';
    case 'match_waiting':
      return 'wait-other';
    case 'match_created':
      return 'match';
    case 'message_received':
    case 'messages':
      return 'chat';
    case 'match_declined':
      return 'declined';
    default:
      return 'new';
  }
}

function notifToneClass(tone: NotifTone): string {
  switch (tone) {
    case 'new':
      return 'notif-tone-new';
    case 'wait':
      return 'notif-tone-wait';
    case 'wait-other':
      return 'notif-tone-wait-other';
    case 'match':
      return 'notif-tone-match';
    case 'chat':
      return 'notif-tone-chat';
    case 'declined':
      return 'notif-tone-declined';
  }
}

type PanelRow =
  | {
      key: string;
      kind: 'social';
      tone: NotifTone;
      at: number;
      n: SocialNotification;
    }
  | {
      key: string;
      kind: 'messages';
      tone: 'chat';
      at: number;
    }
  | {
      key: string;
      kind: 'cat_new';
      tone: 'new';
      at: number;
      count: number;
      soleId?: string | null;
      soleName?: string | null;
      soleOrigin?: 'like' | 'flash' | null;
    }
  | {
      key: string;
      kind: 'merged_new';
      tone: 'new';
      at: number;
      actorId: string;
      displayName: string;
      origin: 'like' | 'flash';
      socialId: string;
    }
  | {
      key: string;
      kind: 'cat_wait';
      tone: 'wait';
      at: number;
      count: number;
      soleId?: string | null;
      soleName?: string | null;
    }
  | {
      key: string;
      kind: 'cat_first';
      tone: 'match';
      at: number;
      count: number;
      soleId?: string | null;
      soleName?: string | null;
    };

/** Forme attendue si la fusion « À découvrir » + social est un jour réactivée (actuellement désactivée, voir `mergeNewWithSocial`). */
type MergedNewSocial = {
  social: { id: string };
  actorId: string;
  displayName: string;
  origin: 'like' | 'flash';
  at: number;
} | null;

/**
 * Toujours `null` pour le moment (fusion désactivée) — passe par une fonction
 * plutôt qu'un littéral direct pour que TypeScript garde le type large
 * `MergedNewSocial` au lieu de figer la valeur à `null` partout où elle est lue.
 */
function getMergeNewWithSocial(): MergedNewSocial {
  return null;
}

function DigestNamedRow({
  title,
  body,
  people,
  extra,
  photos,
  initialClass,
  icon,
  titleClass,
  bodyClass,
  toneClass,
  onOpenAll,
  onOpenPerson,
}: {
  title: string;
  body: string;
  people: { id: string; name: string }[];
  extra: number;
  photos: Record<string, string>;
  initialClass: string;
  icon: ReactNode;
  titleClass: string;
  bodyClass: string;
  toneClass: string;
  onOpenAll: () => void;
  onOpenPerson: (id: string) => void;
}) {
  return (
    <li>
      <div className={`px-3 py-3 border-b ${toneClass}`}>
        <button type="button" onClick={onOpenAll} className="w-full text-left">
          <div className="flex items-start gap-2">
            {icon}
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${titleClass}`}>{title}</p>
              <p className={`text-xs leading-relaxed mt-0.5 ${bodyClass}`}>
                {withNotificationPeriod(body)}
              </p>
            </div>
          </div>
        </button>
        {(people.length > 0 || extra > 0) && (
          <div className="digest-people pl-10">
            {people.map((p) => {
              const photo = photos[p.id];
              const initial = (p.name || '?').charAt(0).toUpperCase();
              return (
                <button
                  key={p.id}
                  type="button"
                  className="digest-person-chip"
                  aria-label={`Ouvrir la fiche de ${p.name}`}
                  onClick={() => onOpenPerson(p.id)}
                >
                  {photo ? (
                    <img
                      src={photo}
                      alt=""
                      className="digest-person-chip-photo"
                    />
                  ) : (
                    <span
                      className={`digest-person-chip-initial ${initialClass}`}
                    >
                      {initial}
                    </span>
                  )}
                  <span className="digest-person-chip-name">{p.name}</span>
                </button>
              );
            })}
            {extra > 0 && (
              <button
                type="button"
                className="digest-person-chip digest-person-chip--more"
                onClick={onOpenAll}
              >
                et {extra} autre{extra > 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function sortRowsForTone(tone: NotifTone, rows: PanelRow[]): PanelRow[] {
  return [...rows].sort((a, b) => {
    if (tone === 'wait') {
      const recap = digestRecapSort(a.kind === 'cat_wait', b.kind === 'cat_wait');
      if (recap !== 0) return recap;
    }
    if (tone === 'match') {
      const recap = digestRecapSort(
        a.kind === 'cat_first',
        b.kind === 'cat_first'
      );
      if (recap !== 0) return recap;
    }
    return b.at - a.at;
  });
}

export default function NotificationsBell({
  onOpenInbox,
  active = true,
}: {
  onOpenInbox?: (actorId?: string | null, opts?: OpenMatchesOpts) => void;
  /** Une seule cloche écoute le temps réel social : celle de l’onglet visible. */
  active?: boolean;
}) {
  const { user } = useAuth();
  const {
    matchedIds,
    waitingIds,
    stickyMatched,
    stickyRefused,
    stickyWait,
    entries: inboxEntries,
    hasSnapshot: syncHasSnapshot,
    markResolved,
    clearedDigestIds,
    clearDigestActor,
  } = useMatchesInboxSync();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SocialNotification[]>([]);
  const [peersWithTwoWay, setPeersWithTwoWay] = useState<Set<string>>(
    () => new Set()
  );
  const [peersWhoWroteToMe, setPeersWhoWroteToMe] = useState<Set<string>>(
    () => new Set()
  );
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [actorPhotos, setActorPhotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [ringing, setRinging] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 8, width: 320 });
  const [catNew, setCatNew] = useState<{
    count: number;
    visible: boolean;
    ids: string[];
    soleId?: string | null;
    soleName?: string | null;
    soleOrigin?: 'like' | 'flash' | null;
  } | null>(null);
  const [catWait, setCatWait] = useState<{
    count: number;
    visible: boolean;
    ids: string[];
    soleId?: string | null;
    soleName?: string | null;
  } | null>(null);
  /** Profils déjà matchés / refusés — jamais d’« À découvrir » pour eux. */
  const [resolvedActorIds, setResolvedActorIds] = useState<Set<string>>(
    () => new Set()
  );
  const [canScrollMore, setCanScrollMore] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  /** Overlay pointerdown closes, then the delayed mobile click hits the bell. */
  const ignoreBellClickUntilRef = useRef(0);
  const socialRefreshTimerRef = useRef<number | null>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const prevMessageTotalRef = useRef(0);
  const primedRef = useRef(false);
  const categoryPrimedRef = useRef(false);
  const lastMessageEventAtRef = useRef(0);
  const unreadMessages = useUnreadMessages();
  const [waitSoleFetchedName, setWaitSoleFetchedName] = useState<string | null>(
    null
  );
  const [firstDismissed, setFirstDismissed] = useState(false);
  const [newDismissed, setNewDismissed] = useState(false);
  const [waitDismissed, setWaitDismissed] = useState(false);
  const [categoryServerReady, setCategoryServerReady] = useState(false);
  const droppedLikeActorsRef = useRef<Set<string>>(new Set());
  const digestFetchedRef = useRef<Set<string>>(new Set());
  const discoverBaselineRef = useRef(emptyRubricBaseline());
  const waitBaselineRef = useRef(emptyRubricBaseline());
  const firstBaselineRef = useRef(emptyRubricBaseline());
  const declinedBaselineRef = useRef(emptyRubricBaseline());
  const waitOtherBaselineRef = useRef(emptyRubricBaseline());
  const [, bumpBellSeen] = useState(0);
  const [socialListReady, setSocialListReady] = useState(false);

  /** Matchs verts Mes Matchs + résolus serveur / optimistes. */
  const isActorResolved = (id: string | null | undefined) => {
    if (!id) return false;
    return resolvedActorIds.has(id) || matchedIds.has(id);
  };

  const inboxSticky = useMemo(
    () => ({
      matched: new Set<string>([
        ...stickyMatched,
        ...resolvedActorIds,
        ...matchedIds,
      ]),
      refused: stickyRefused,
      wait: stickyWait,
    }),
    [stickyMatched, stickyRefused, stickyWait, resolvedActorIds, matchedIds]
  );
  const inboxStickyRef = useRef(inboxSticky);
  inboxStickyRef.current = inboxSticky;
  const snapshotReady = syncHasSnapshot || inboxEntries.length > 0;
  const archivedWaitIds = useMemo(() => {
    if (!user) return [] as string[];
    return inboxEntries
      .map((e) => e.id)
      .filter((id) => isMineWaitArchived(user.id, id));
  }, [inboxEntries, user]);

  const liveNewIds = useMemo(
    () =>
      omitVisitedDigestIds(
        selectLiveDigestIds({
          snapshotIds: digestPinIdsFromEntries(inboxEntries, 'new'),
          serverIds: catNew?.ids ?? [],
          sticky: inboxSticky,
          as: 'new',
          snapshotReady,
          serverReady: categoryServerReady,
        }),
        clearedDigestIds
      ),
    [
      inboxEntries,
      catNew?.ids,
      inboxSticky,
      snapshotReady,
      categoryServerReady,
      clearedDigestIds,
    ]
  );
  const liveWaitIds = useMemo(
    () =>
      omitUnreadMessageSenders(
        omitVisitedDigestIds(
          selectLiveDigestIds({
            snapshotIds: digestPinIdsFromEntries(
              inboxEntries,
              'wait',
              archivedWaitIds
            ),
            serverIds: catWait?.ids ?? [],
            sticky: inboxSticky,
            as: 'wait',
            snapshotReady,
            serverReady: categoryServerReady,
          }),
          clearedDigestIds
        ),
        unreadMessages.bySender
      ),
    [
      inboxEntries,
      archivedWaitIds,
      catWait?.ids,
      inboxSticky,
      snapshotReady,
      categoryServerReady,
      clearedDigestIds,
      unreadMessages.bySender,
    ]
  );

  const nameForActor = (id: string | null | undefined) => {
    if (!id) return null;
    const fromSnap = inboxEntries.find((e) => e.id === id)?.displayName;
    const named = (fromSnap || actorNames[id] || '').trim();
    return named && named !== 'Quelqu’un' ? named : named || null;
  };

  const activeCatNew =
    liveNewIds.length === 0
      ? null
      : {
          count: liveNewIds.length,
          visible: !newDismissed,
          ids: liveNewIds,
          soleId: liveNewIds.length === 1 ? liveNewIds[0] : null,
          soleName:
            liveNewIds.length === 1
              ? nameForActor(liveNewIds[0]) || catNew?.soleName || null
              : null,
          soleOrigin:
            liveNewIds.length === 1
              ? inboxEntries.find((e) => e.id === liveNewIds[0])?.origin ??
                catNew?.soleOrigin ??
                null
              : null,
        };
  const activeCatWait =
    liveWaitIds.length === 0
      ? null
      : {
          count: liveWaitIds.length,
          visible: !waitDismissed,
          ids: liveWaitIds,
          soleId: liveWaitIds.length === 1 ? liveWaitIds[0] : null,
          soleName:
            liveWaitIds.length === 1
              ? nameForActor(liveWaitIds[0]) || catWait?.soleName || null
              : null,
        };

  const twoWayPeers = useMemo(() => {
    const ids = new Set(peersWithTwoWay);
    for (const e of inboxEntries) {
      if (e.status === 'matched-chat') ids.add(e.id);
    }
    return ids;
  }, [peersWithTwoWay, inboxEntries]);

  const quietMatches = useMemo(() => {
    const listed = snapshotReady
      ? digestPinIdsFromEntries(inboxEntries, 'first').map((id) => ({
          id,
          displayName:
            (inboxEntries.find((e) => e.id === id)?.displayName ||
              actorNames[id] ||
              ''
            ).trim() || 'Quelqu’un',
        }))
      : (() => {
          const seen = new Map<string, { id: string; displayName: string }>();
          for (const n of items) {
            if (n.kind !== 'match_created' || !n.actor_id) continue;
            if (twoWayPeers.has(n.actor_id)) continue;
            if (seen.has(n.actor_id)) continue;
            const named = (actorNames[n.actor_id] || '').trim();
            seen.set(n.actor_id, {
              id: n.actor_id,
              displayName: named || 'Quelqu’un',
            });
          }
          return [...seen.values()];
        })();
    const kept = new Set(
      omitUnreadMessageSenders(
        omitVisitedDigestIds(
          listed.map((m) => m.id),
          clearedDigestIds
        ),
        unreadMessages.bySender
      )
    );
    return listed.filter((m) => kept.has(m.id));
  }, [
    snapshotReady,
    inboxEntries,
    items,
    twoWayPeers,
    actorNames,
    clearedDigestIds,
    unreadMessages.bySender,
  ]);

  const hasFirstAlert = quietMatches.length > 0 && !firstDismissed;
  const firstSole = quietMatches.length === 1 ? quietMatches[0] : null;
  const prevQuietCountRef = useRef(0);

  useEffect(() => {
    const n = quietMatches.length;
    if (n > 0) {
      prevQuietCountRef.current = n;
      return;
    }
    if (prevQuietCountRef.current > 0 && user) {
      sessionStorage.removeItem(categoryNotifSessionKey(user.id, 'first'));
      setFirstDismissed(false);
    }
    prevQuietCountRef.current = 0;
  }, [quietMatches.length, user]);

  useEffect(() => {
    if (!hasFirstAlert || !user) return;
    const ringKey = categoryRingSessionKey(user.id);
    if (categoryPrimedRef.current || sessionStorage.getItem(ringKey) === '1') {
      categoryPrimedRef.current = true;
      return;
    }
    categoryPrimedRef.current = true;
    sessionStorage.setItem(ringKey, '1');
    setRinging(true);
    const t = window.setTimeout(() => setRinging(false), 1200);
    return () => window.clearTimeout(t);
  }, [hasFirstAlert, user]);

  useEffect(() => {
    const count = activeCatWait?.count ?? 0;
    const known = (activeCatWait?.soleName || '').trim();
    const id = activeCatWait?.soleId || null;
    if (count !== 1) {
      setWaitSoleFetchedName(null);
      return;
    }
    if (known && known !== 'Quelqu’un') {
      setWaitSoleFetchedName(known);
      return;
    }
    if (!id) {
      setWaitSoleFetchedName(known || null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      const name = String(
        (data as { display_name?: string | null } | null)?.display_name || ''
      ).trim();
      setWaitSoleFetchedName(name || known || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCatWait?.count, activeCatWait?.soleId, activeCatWait?.soleName]);

  const digestNameById = useMemo(() => {
    const map: Record<string, string> = { ...actorNames };
    for (const e of inboxEntries) {
      const n = (e.displayName || '').trim();
      if (e.id && n) map[e.id] = n;
    }
    if (activeCatNew?.soleId && activeCatNew.soleName) {
      map[activeCatNew.soleId] = activeCatNew.soleName;
    }
    if (activeCatWait?.soleId && (waitSoleFetchedName || activeCatWait.soleName)) {
      map[activeCatWait.soleId] =
        waitSoleFetchedName || activeCatWait.soleName || map[activeCatWait.soleId];
    }
    for (const m of quietMatches) {
      const n = (m.displayName || '').trim();
      if (m.id && n) map[m.id] = n;
    }
    return map;
  }, [
    actorNames,
    inboxEntries,
    activeCatNew,
    activeCatWait,
    waitSoleFetchedName,
    quietMatches,
  ]);

  const digestPersonIds = useMemo(
    () => [
      ...new Set([
        ...liveNewIds,
        ...liveWaitIds,
        ...quietMatches.map((m) => m.id),
      ]),
    ],
    [liveNewIds, liveWaitIds, quietMatches]
  );

  useEffect(() => {
    if (!open || digestPersonIds.length === 0) return;
    const toFetch = digestPersonIds.filter(
      (id) => !digestFetchedRef.current.has(id)
    );
    if (toFetch.length === 0) return;
    for (const id of toFetch) digestFetchedRef.current.add(id);
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, photo_url')
        .in('id', toFetch);
      if (cancelled || !data) return;
      const names: Record<string, string> = {};
      const photos: Record<string, string> = {};
      for (const row of data) {
        const id = (row as { id: string }).id;
        const dn = String(
          (row as { display_name?: string | null }).display_name || ''
        ).trim();
        const photo = String(
          (row as { photo_url?: string | null }).photo_url || ''
        ).trim();
        if (id && dn) names[id] = dn;
        if (id && photo) photos[id] = photo;
      }
      if (Object.keys(names).length > 0) {
        setActorNames((prev) => ({ ...prev, ...names }));
      }
      if (Object.keys(photos).length > 0) {
        setActorPhotos((prev) => ({ ...prev, ...photos }));
      }
    })();
    return () => {
      cancelled = true;
      for (const id of toFetch) digestFetchedRef.current.delete(id);
    };
  }, [open, digestPersonIds]);

  const isVisibleSocial = (n: SocialNotification) => {
    if (n.kind === 'message_received') return false;
    if (isDismissedDeclinedNotification(n, user?.id)) return false;
    if (isWaitingNoticeDismissed(n, user?.id)) return false;
    if (n.read_at) return false;
    if (
      (n.kind === 'like_received' || n.kind === 'flash_received') &&
      n.actor_id &&
      droppedLikeActorsRef.current.has(n.actor_id)
    ) {
      return false;
    }
    // Rappel individuel remplacé par le digest « En attente »
    if (n.kind === 'match_wait_reminder') return false;
    // Jamais de Flash/Like « à découvrir » ni d’attente obsolète si déjà matché / refusé
    if (
      (n.kind === 'flash_received' ||
        n.kind === 'like_received' ||
        n.kind === 'match_waiting') &&
      n.actor_id &&
      isActorResolved(n.actor_id)
    ) {
      return false;
    }
    // Messagerie ouverte → priorité à l’alerte message
    if (n.kind === 'match_created') {
      return false;
    }
    return true;
  };

  const discoverPinIds = activeCatNew?.ids || [];
  const waitPinIds = activeCatWait?.ids || [];
  const discoverRecapCount = discoverPinIds.length;
  const discoverPeople = resolveDigestPeople(discoverPinIds, digestNameById);
  const waitPeople = resolveDigestPeople(waitPinIds, digestNameById);
  const firstMemberIds = quietMatches.map((m) => m.id);
  const firstPeople = resolveDigestPeople(firstMemberIds, digestNameById);

  const socialItems = items.filter((n) => {
    if (!isVisibleSocial(n)) return false;
    if (n.kind === 'like_received' || n.kind === 'flash_received') {
      return socialLikeInDiscoverSet(n.actor_id, discoverPinIds, waitPinIds);
    }
    return true;
  });
  const socialOnlyUnread = socialItems.filter((n) => !n.read_at).length;
  const hasNewAlert = Boolean(activeCatNew?.visible) && discoverRecapCount > 0;
  const hasWaitAlert = Boolean(activeCatWait?.visible) && waitPinIds.length > 0;

  const discoverReady = snapshotReady || categoryServerReady;
  const discoverSplit = observeRubricMembers(
    discoverBaselineRef.current,
    discoverPinIds,
    discoverReady
  );
  const waitSplit = observeRubricMembers(
    waitBaselineRef.current,
    waitPinIds,
    discoverReady
  );
  const firstSplit = observeRubricMembers(
    firstBaselineRef.current,
    firstMemberIds,
    snapshotReady || socialListReady
  );
  const declinedMemberIds = collectUnreadActorIds(
    socialItems,
    BELL_RUBRIC_UNREAD_KINDS.declined
  );
  const declinedSplit = observeRubricMembers(
    declinedBaselineRef.current,
    declinedMemberIds,
    socialListReady
  );
  const waitOtherMemberIds = collectUnreadActorIds(
    socialItems,
    BELL_RUBRIC_UNREAD_KINDS.waitOther
  );
  const waitOtherSplit = observeRubricMembers(
    waitOtherBaselineRef.current,
    waitOtherMemberIds,
    socialListReady
  );

  /** Like/Flash individuels restent au-dessus ; le récap relie les profils encore à traiter. */
  const mergeNewWithSocial = getMergeNewWithSocial();

  const categoryUnread =
    (hasNewAlert && !mergeNewWithSocial ? 1 : 0) +
    (hasWaitAlert ? 1 : 0) +
    (hasFirstAlert ? 1 : 0);
  const hasMessageAlert = unreadMessages.total > 0;
  const showMarkAll = socialOnlyUnread > 0 || categoryUnread > 0;

  useEffect(() => {
    if (!user) return;
    writeRubricBaseline(user.id, 'new', discoverBaselineRef.current);
    writeRubricBaseline(user.id, 'wait', waitBaselineRef.current);
    writeRubricBaseline(user.id, 'first', firstBaselineRef.current);
    writeRubricBaseline(user.id, 'declined', declinedBaselineRef.current);
    writeRubricBaseline(user.id, 'waitOther', waitOtherBaselineRef.current);
  }, [
    user,
    discoverSplit.stockIds.join(','),
    discoverSplit.freshIds.join(','),
    waitSplit.stockIds.join(','),
    waitSplit.freshIds.join(','),
    firstSplit.stockIds.join(','),
    firstSplit.freshIds.join(','),
    declinedSplit.stockIds.join(','),
    declinedSplit.freshIds.join(','),
    waitOtherSplit.stockIds.join(','),
    waitOtherSplit.freshIds.join(','),
  ]);

  const orderedBlocks = useMemo(() => {
    const rows: PanelRow[] = [];
    const skipSocialId = mergeNewWithSocial?.social.id ?? null;

    for (const n of socialItems) {
      if (skipSocialId && n.id === skipSocialId) continue;
      const at = Date.parse(n.created_at) || 0;
      rows.push({
        key: n.id,
        kind: 'social',
        tone: toneFromKind(n.kind),
        at,
        n,
      });
    }

    if (hasMessageAlert) {
      rows.push({
        key: 'messages',
        kind: 'messages',
        tone: 'chat',
        at: lastMessageEventAtRef.current || Date.now(),
      });
    }

    if (mergeNewWithSocial) {
      rows.push({
        key: `merged-new-${mergeNewWithSocial.actorId}`,
        kind: 'merged_new',
        tone: 'new',
        at: mergeNewWithSocial.at,
        actorId: mergeNewWithSocial.actorId,
        displayName: mergeNewWithSocial.displayName,
        origin: mergeNewWithSocial.origin,
        socialId: mergeNewWithSocial.social.id,
      });
    } else if (hasNewAlert && activeCatNew) {
      // Garde-fou : jamais de digest « À découvrir » pour un profil déjà matché
      if (activeCatNew.soleId && isActorResolved(activeCatNew.soleId)) {
        /* skip */
      } else {
        rows.push({
          key: 'cat-new',
          kind: 'cat_new',
          tone: 'new',
          at: 0,
          count: discoverRecapCount,
          soleId: activeCatNew.soleId,
          soleName: activeCatNew.soleName,
          soleOrigin: activeCatNew.soleOrigin,
        });
      }
    }

    if (hasWaitAlert && activeCatWait) {
        rows.push({
          key: 'cat-wait',
          kind: 'cat_wait',
          tone: 'wait',
          at: 0,
          count: waitPinIds.length,
          soleId: activeCatWait.soleId,
          soleName: activeCatWait.soleName,
        });
    }

    if (hasFirstAlert) {
      rows.push({
        key: 'cat-first',
        kind: 'cat_first',
        tone: 'match',
        at: 0,
        count: quietMatches.length,
        soleId: firstSole?.id ?? null,
        soleName: firstSole?.displayName ?? null,
      });
    }

    const blocks: { tone: NotifTone; rows: PanelRow[] }[] = [];
    for (const tone of TONE_HIERARCHY_TOP_TO_BOTTOM) {
      const group = sortRowsForTone(
        tone,
        rows.filter((r) => r.tone === tone)
      );
      if (group.length > 0) blocks.push({ tone, rows: group });
    }
    return { blocks };
  }, [
    socialItems,
    hasMessageAlert,
    hasNewAlert,
    hasWaitAlert,
    hasFirstAlert,
    activeCatNew,
    activeCatWait,
    quietMatches,
    firstSole,
    discoverRecapCount,
    waitPinIds,
    mergeNewWithSocial,
    unreadMessages.total,
    resolvedActorIds,
    matchedIds,
  ]);

  const badgeCount = bellPanelCardCount(orderedBlocks.blocks);

  const refreshCategoryNotifs = useCallback(async () => {
    if (!user) {
      setCatNew(null);
      setCatWait(null);
      setResolvedActorIds(new Set());
      setCategoryServerReady(false);
      return;
    }
    try {
      const { newIds, waitIds, soleNew, soleWait, resolvedActorIds: resolved } =
        await countInboxCategories(user.id);

      // Union : ne jamais écraser les matchs déjà connus (Mes Matchs / optimiste)
      setResolvedActorIds((prev) => {
        const next = new Set(prev);
        for (const id of resolved) next.add(id);
        for (const id of matchedIds) next.add(id);
        return next;
      });

      const soleResolved =
        Boolean(soleNew?.id) &&
        (resolved.includes(soleNew!.id) || matchedIds.has(soleNew!.id));

      const storedNewDismissed =
        sessionStorage.getItem(categoryNotifSessionKey(user.id, 'new')) ===
        '1';
      const storedWaitDismissed =
        sessionStorage.getItem(categoryNotifSessionKey(user.id, 'wait')) ===
        '1';
      const sticky = inboxStickyRef.current;
      const liveNewIds = filterServerDigestIds(newIds || [], sticky, 'new');
      const liveWaitIds = filterServerDigestIds(
        (waitIds || []).filter((id) => !isMineWaitArchived(user.id, id)),
        sticky,
        'wait'
      );
      const liveNewCount = liveNewIds.length;
      const liveWaitCount = liveWaitIds.length;
      setNewDismissed(liveNewCount <= 0 ? false : storedNewDismissed);
      setWaitDismissed(liveWaitCount <= 0 ? false : storedWaitDismissed);
      const liveSoleWaitId =
        liveWaitCount === 1 ? liveWaitIds[0] : null;
      const liveSoleWait =
        liveSoleWaitId && soleWait?.id === liveSoleWaitId ? soleWait : null;
      const liveSoleNewId = liveNewCount === 1 ? liveNewIds[0] : null;
      const liveSoleNew =
        liveSoleNewId && soleNew?.id === liveSoleNewId ? soleNew : null;

      setCatNew(
        liveNewCount > 0 && !soleResolved
          ? {
              count: liveNewCount,
              visible: !storedNewDismissed,
              ids: liveNewIds,
              soleId: liveSoleNew?.id ?? liveSoleNewId,
              soleName: liveSoleNew?.displayName ?? null,
              soleOrigin: liveSoleNew?.origin ?? null,
            }
          : null
      );
      // Compteur à 0 → plus jamais de digest « À découvrir » fantôme
      if (liveNewCount <= 0 && user) {
        sessionStorage.removeItem(categoryNotifSessionKey(user.id, 'new'));
      }
      setCatWait(
        liveWaitCount > 0
          ? {
              count: liveWaitCount,
              visible: !storedWaitDismissed,
              ids: liveWaitIds,
              soleId: liveSoleWait?.id ?? liveSoleWaitId,
              soleName: liveSoleWait?.displayName ?? null,
            }
          : null
      );
      if (liveWaitCount <= 0 && user) {
        sessionStorage.removeItem(categoryNotifSessionKey(user.id, 'wait'));
      }
      setCategoryServerReady(true);

      const anyVisible =
        (liveNewCount > 0 && !soleResolved && !storedNewDismissed) ||
        (liveWaitCount > 0 && !storedWaitDismissed);
      if (anyVisible && user) {
        const ringKey = categoryRingSessionKey(user.id);
        const rangThisTab =
          categoryPrimedRef.current ||
          sessionStorage.getItem(ringKey) === '1';
        categoryPrimedRef.current = true;
        if (!rangThisTab) {
          sessionStorage.setItem(ringKey, '1');
          setRinging(true);
          window.setTimeout(() => setRinging(false), 1200);
        }
      }
    } catch {
      /* optionnel */
    }
  }, [user, matchedIds]);

  const refresh = useCallback(async () => {
    try {
      await sweepStaleSocialNotifications();
      const [list, dialogue] = await Promise.all([
        fetchSocialNotifications(25),
        fetchPeerDialogueFlags(),
      ]);
      setPeersWithTwoWay(dialogue.twoWay);
      setPeersWhoWroteToMe(dialogue.wroteToMe);
      setSocialListReady(true);
      setItems(
        list.filter((n) => {
          if (isDismissedDeclinedNotification(n, user?.id)) return false;
          if (isWaitingNoticeDismissed(n, user?.id)) return false;
          if (
            (n.kind === 'like_received' || n.kind === 'flash_received') &&
            n.actor_id &&
            droppedLikeActorsRef.current.has(n.actor_id)
          ) {
            return false;
          }
          return true;
        })
      );

      const actorIds = [
        ...new Set(
          list
            .map((n) => n.actor_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      if (actorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', actorIds);
        const map: Record<string, string> = {};
        for (const p of profiles || []) {
          const id = (p as { id: string }).id;
          const dn = String(
            (p as { display_name?: string | null }).display_name || ''
          ).trim();
          if (id && dn) map[id] = dn;
        }
        setActorNames((prev) => ({ ...prev, ...map }));
      }
    } catch {
      /* silencieux : inbox optionnelle */
    }
  }, [user?.id]);

  useEffect(() => {
    if (!active) {
      setOpen(false);
      return;
    }
    void refresh();
    void refreshCategoryNotifs();
  }, [active, refresh, refreshCategoryNotifs]);

  const applyInboxDecisionLocally = useCallback(
    (detail?: InboxUpdatedDetail) => {
      const actorId = detail?.actorId;
      const decision = detail?.decision;
      if (!actorId || !decision) return;

      if (decision === 'match') markResolved(actorId, 'matched');
      else if (decision === 'refuse') markResolved(actorId, 'refused');
      else if (decision === 'wait') {
        markResolved(actorId, 'wait');
        droppedLikeActorsRef.current.add(actorId);
      } else if (decision === 'reset') {
        markResolved(actorId, 'new');
        droppedLikeActorsRef.current.delete(actorId);
        setItems((prev) =>
          prev.filter(
            (n) =>
              !(
                n.actor_id === actorId && n.kind === 'match_wait_reminder'
              )
          )
        );
        setCatWait((prev) => removeActorFromCategoryDigest(prev, actorId));
      }

      if (decision === 'match' || decision === 'refuse') {
        droppedLikeActorsRef.current.add(actorId);
        setResolvedActorIds((prev) => {
          const next = new Set(prev);
          next.add(actorId);
          return next;
        });
        setItems((prev) =>
          prev.filter(
            (n) =>
              !(
                n.actor_id === actorId &&
                (n.kind === 'flash_received' ||
                  n.kind === 'like_received' ||
                  n.kind === 'match_wait_reminder')
              )
          )
        );
        setCatNew((prev) => removeActorFromCategoryDigest(prev, actorId));
        setCatWait((prev) => removeActorFromCategoryDigest(prev, actorId));
      }

      if (decision === 'wait') {
        setItems((prev) =>
          prev.filter(
            (n) =>
              !(
                n.actor_id === actorId &&
                (n.kind === 'flash_received' || n.kind === 'like_received')
              )
          )
        );
        setCatNew((prev) => removeActorFromCategoryDigest(prev, actorId));
      }
    },
    [markResolved]
  );

  useInboxReload(
    useCallback(
      (detail?: InboxUpdatedDetail) => {
        if (detail?.decision === 'declined-dismiss') {
          const nid = detail.notificationId;
          const aid = detail.actorId;
          setItems((prev) =>
            prev.filter((n) => {
              if (nid && n.id === nid) return false;
              if (aid && n.kind === 'match_declined' && n.actor_id === aid) {
                return false;
              }
              return !isDismissedDeclinedNotification(n, user?.id);
            })
          );
        }
        if (detail?.decision === 'wait-dismiss') {
          const nid = detail.notificationId;
          const aid = detail.actorId;
          setItems((prev) =>
            prev.filter((n) => {
              if (nid && n.id === nid) return false;
              if (
                aid &&
                (n.kind === 'match_waiting' ||
                  n.kind === 'match_wait_reminder') &&
                n.actor_id === aid
              ) {
                return false;
              }
              return !isWaitingNoticeDismissed(n, user?.id);
            })
          );
        }
        applyInboxDecisionLocally(detail);
        void (async () => {
          try {
            await sweepStaleSocialNotifications(detail?.actorId ?? null);
          } catch {
            /* non bloquant */
          }
          await Promise.all([refresh(), refreshCategoryNotifs()]);
        })();
      },
      [applyInboxDecisionLocally, refresh, refreshCategoryNotifs, user?.id]
    )
  );

  useEffect(() => {
    primedRef.current = false;
    categoryPrimedRef.current = false;
    prevMessageTotalRef.current = 0;
    lastMessageEventAtRef.current = 0;
    setRinging(false);
    setCatNew(null);
    setCatWait(null);
    setCategoryServerReady(false);
    setResolvedActorIds(new Set());
    droppedLikeActorsRef.current = new Set();
    digestFetchedRef.current = new Set();
    discoverBaselineRef.current = user
      ? readRubricBaseline(user.id, 'new')
      : emptyRubricBaseline();
    waitBaselineRef.current = user
      ? readRubricBaseline(user.id, 'wait')
      : emptyRubricBaseline();
    firstBaselineRef.current = user
      ? readRubricBaseline(user.id, 'first')
      : emptyRubricBaseline();
    declinedBaselineRef.current = user
      ? readRubricBaseline(user.id, 'declined')
      : emptyRubricBaseline();
    waitOtherBaselineRef.current = user
      ? readRubricBaseline(user.id, 'waitOther')
      : emptyRubricBaseline();
    bumpBellSeen((n) => n + 1);
    setSocialListReady(false);
    setActorNames({});
    setActorPhotos({});
    setNewDismissed(
      user
        ? sessionStorage.getItem(categoryNotifSessionKey(user.id, 'new')) ===
          '1'
        : false
    );
    setWaitDismissed(
      user
        ? sessionStorage.getItem(categoryNotifSessionKey(user.id, 'wait')) ===
          '1'
        : false
    );
    setFirstDismissed(
      user
        ? sessionStorage.getItem(categoryNotifSessionKey(user.id, 'first')) ===
          '1'
        : false
    );
    prevQuietCountRef.current = 0;
  }, [user?.id]);

  useEffect(() => {
    if (!unreadMessages.ready) return;
    if (!primedRef.current) {
      primedRef.current = true;
      prevMessageTotalRef.current = unreadMessages.total;
      if (unreadMessages.total > 0) {
        lastMessageEventAtRef.current = Date.now();
      }
      return;
    }
    if (unreadMessages.total > prevMessageTotalRef.current) {
      lastMessageEventAtRef.current = Date.now();
      setRinging(true);
      const t = window.setTimeout(() => setRinging(false), 800);
      prevMessageTotalRef.current = unreadMessages.total;
      return () => window.clearTimeout(t);
    }
    prevMessageTotalRef.current = unreadMessages.total;
  }, [unreadMessages.ready, unreadMessages.total]);

  useEffect(() => {
    if (!user || !active) return;
    const scheduleSocialRefresh = () => {
      if (socialRefreshTimerRef.current != null) {
        window.clearTimeout(socialRefreshTimerRef.current);
      }
      socialRefreshTimerRef.current = window.setTimeout(() => {
        socialRefreshTimerRef.current = null;
        void refresh();
        void refreshCategoryNotifs();
      }, 400);
    };
    const channel = supabase
      .channel(`social-inbox:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'social_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        scheduleSocialRefresh
      )
      .subscribe();
    return () => {
      if (socialRefreshTimerRef.current != null) {
        window.clearTimeout(socialRefreshTimerRef.current);
        socialRefreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [user, active, refresh, refreshCategoryNotifs]);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  const pointerHitsBell = (clientX: number, clientY: number) => {
    const el = bellRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    );
  };

  const closeFromOutside = (e: { clientX: number; clientY: number; preventDefault: () => void }) => {
    const until = ghostClickIgnoreUntil(
      Date.now(),
      pointerHitsBell(e.clientX, e.clientY)
    );
    if (until != null) {
      e.preventDefault();
      ignoreBellClickUntilRef.current = until;
    }
    closePanel();
  };

  const openMessageInbox = () => {
    closePanel();
    const senders = Object.entries(unreadMessages.bySender).filter(
      ([, n]) => n > 0
    );
    if (senders.length === 1) {
      onOpenInbox?.(senders[0][0], true);
      return;
    }
    onOpenInbox?.(null, {
      unreadMailbox: true,
      pinActorIds: senders.map(([id]) => id),
    });
  };

  const placePanel = useCallback(() => {
    const rect = bellRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPanelPos(placeNotifPanel(rect, notifPanelViewport()));
  }, []);

  useEffect(() => {
    if (!open) return;
    placePanel();
    const onMove = () => placePanel();
    window.addEventListener('resize', onMove);
    window.visualViewport?.addEventListener('resize', onMove);
    window.visualViewport?.addEventListener('scroll', onMove);
    return () => {
      window.removeEventListener('resize', onMove);
      window.visualViewport?.removeEventListener('resize', onMove);
      window.visualViewport?.removeEventListener('scroll', onMove);
    };
  }, [open, placePanel]);

  const handleOpen = async () => {
    const next = !open;
    if (next) {
      if (discoverReady) {
        absorbRubricConsultation(discoverBaselineRef.current, discoverPinIds);
        absorbRubricConsultation(waitBaselineRef.current, waitPinIds);
      }
      if (snapshotReady || socialListReady) {
        absorbRubricConsultation(firstBaselineRef.current, firstMemberIds);
      }
      if (socialListReady) {
        absorbRubricConsultation(
          declinedBaselineRef.current,
          declinedMemberIds
        );
        absorbRubricConsultation(
          waitOtherBaselineRef.current,
          waitOtherMemberIds
        );
      }
      if (user) {
        writeRubricBaseline(user.id, 'new', discoverBaselineRef.current);
        writeRubricBaseline(user.id, 'wait', waitBaselineRef.current);
        writeRubricBaseline(user.id, 'first', firstBaselineRef.current);
        writeRubricBaseline(user.id, 'declined', declinedBaselineRef.current);
        writeRubricBaseline(user.id, 'waitOther', waitOtherBaselineRef.current);
      }
      bumpBellSeen((n) => n + 1);
      placePanel();
      setOpen(true);
      setLoading(true);
      await Promise.all([refresh(), refreshCategoryNotifs()]);
      setLoading(false);
    } else {
      closePanel();
    }
  };

  const dismissCategory = (category: MatchPulseCategory) => {
    if (!user) return;
    sessionStorage.setItem(categoryNotifSessionKey(user.id, category), '1');
    if (category === 'new') {
      setNewDismissed(true);
      setCatNew((prev) => (prev ? { ...prev, visible: false } : prev));
    } else if (category === 'wait') {
      setWaitDismissed(true);
      setCatWait((prev) => (prev ? { ...prev, visible: false } : prev));
    } else {
      setFirstDismissed(true);
    }
  };

  const openCategory = (category: MatchPulseCategory, pinActorIds: string[] = []) => {
    closePanel();
    onOpenInbox?.(null, openDigestOpts(category, pinActorIds));
  };

  const openDigestPerson = (category: MatchPulseCategory, actorId: string) => {
    if (!actorId) return;
    clearDigestActor(actorId);
    closePanel();
    onOpenInbox?.(actorId, openDigestOpts(category, [actorId]));
  };

  const openMergedNew = (row: Extract<PanelRow, { kind: 'merged_new' }>) => {
    closePanel();
    dismissCategory('new');
    clearDigestActor(row.actorId);
    setItems((prev) => prev.filter((x) => x.id !== row.socialId));
    onOpenInbox?.(row.actorId, openLikeOpts(row.actorId, 'new'));
    void markSocialNotificationRead(row.socialId)
      .then(async () => {
        await sweepStaleSocialNotifications(row.actorId);
      })
      .catch(() => {
        /* panneau déjà fermé */
      });
  };

  const updateScrollHint = useCallback(() => {
    const el = listScrollRef.current;
    if (!el) {
      setCanScrollMore(false);
      return;
    }
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Disparaît dès que le bas est atteint (marge de ~12px)
    setCanScrollMore(el.scrollHeight > el.clientHeight + 8 && remaining > 12);
  }, []);

  const scrollNotificationsDown = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const el = listScrollRef.current;
      if (!el) return;
      el.scrollBy({ top: 100, behavior: 'smooth' });
      window.setTimeout(() => updateScrollHint(), 120);
    },
    [updateScrollHint]
  );

  useEffect(() => {
    if (!open) {
      setCanScrollMore(false);
      return;
    }
    const id = window.requestAnimationFrame(() => updateScrollHint());
    return () => window.cancelAnimationFrame(id);
  }, [open, orderedBlocks.blocks, loading, updateScrollHint]);

  const handleMarkAll = async () => {
    dismissCategory('new');
    dismissCategory('wait');
    dismissCategory('first');
    try {
      await markAllSocialNotificationsRead();
    } catch {
      /* non bloquant */
    }
    setItems((prev) =>
      prev.filter(
        (n) => n.kind !== 'flash_received' && n.kind !== 'like_received'
      ).map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
    void sweepStaleSocialNotifications();
  };

  const handleItemClick = (n: SocialNotification) => {
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    if (n.actor_id) clearDigestActor(n.actor_id);
    closePanel();
    if (isInboxNotification(n)) {
      const actorLabel =
        (n.actor_id && actorNames[n.actor_id]?.trim()) || null;
      const reminderName = actorLabel;
      const isWaitReminder = n.kind === 'match_wait_reminder';
      const isWaitExpiry = n.kind === 'match_wait_expiry';

      if (n.kind === 'message_received') {
        onOpenInbox?.(n.actor_id, true);
      } else if (n.kind === 'flash_received' || n.kind === 'like_received') {
        const waitSet = waitPinIds.length > 0 ? waitPinIds : waitingIds;
        const floor = likeFloorForActor(n.actor_id || '', waitSet);
        onOpenInbox?.(n.actor_id, openLikeOpts(n.actor_id || '', floor));
      } else if (n.kind === 'match_declined') {
        onOpenInbox?.(n.actor_id, {
          declined: true,
          hintName: actorLabel,
        });
      } else if (isWaitReminder) {
        onOpenInbox?.(n.actor_id, {
          highlight: true,
          hintName: reminderName,
        });
      } else if (isWaitExpiry) {
        onOpenInbox?.(n.actor_id, {
          highlight: Boolean(n.actor_id),
          hintName: actorLabel,
          pulseCategory: 'wait',
        });
      } else if (n.kind === 'match_waiting') {
        onOpenInbox?.(n.actor_id, {
          highlight: true,
          hintName: actorLabel,
          waitingIncoming: true,
        });
      } else {
        onOpenInbox?.(n.actor_id);
      }
    }
    void markSocialNotificationRead(n.id)
      .then(async () => {
        if (n.kind === 'flash_received' || n.kind === 'like_received') {
          await sweepStaleSocialNotifications(n.actor_id);
        }
      })
      .catch(() => {
        /* le panneau est déjà fermé */
      });
  };

  const panel =
    open &&
    createPortal(
      <>
        <div
          className="fixed inset-0 z-[80]"
          aria-hidden
          onPointerDown={closeFromOutside}
        />
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed z-[90] max-w-[calc(100vw-1rem)] rounded-2xl border border-gray-100 bg-white shadow-xl shadow-gray-200/80 overflow-hidden animate-fadeIn"
          style={{
            top: panelPos.top,
            left: panelPos.left,
            width: panelPos.width,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            {showMarkAll && (
              <button
                type="button"
                onClick={() => void handleMarkAll()}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Tout lu
              </button>
            )}
          </div>

          <div className="notif-panel-body">
            <div
              ref={listScrollRef}
              className="notif-panel-scroll-list"
              onScroll={updateScrollHint}
            >
            {loading &&
            socialItems.length === 0 &&
            !hasMessageAlert &&
            !hasNewAlert &&
            !hasWaitAlert &&
            !hasFirstAlert ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">
                Chargement…
              </p>
            ) : socialItems.length === 0 &&
              !hasMessageAlert &&
              !hasNewAlert &&
              !hasWaitAlert &&
              !hasFirstAlert ? (
              <div className="px-4 py-8 text-center">
                <Sparkles className="w-6 h-6 text-rose-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  Aucune notification pour le moment
                </p>
              </div>
            ) : (
              <div className="notif-panel-list notif-panel-list--end">
                {orderedBlocks.blocks.map((block) => (
                  <ul
                    key={block.tone}
                    className={`notif-block notif-block-${block.tone}`}
                  >
                    {block.rows.map((row) => {
                      if (row.kind === 'messages') {
                        const copy = unreadMessagesRecapCopy(
                          unreadMessages.total
                        );
                        return (
                          <li key={row.key}>
                            <button
                              type="button"
                              onClick={openMessageInbox}
                              className={`w-full text-left px-3 py-3 border-b transition-colors ${notifToneClass('chat')}`}
                            >
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 relative w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0">
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  <UnreadBadge
                                    count={unreadMessages.total}
                                    className="absolute -top-1 -right-1"
                                  />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-rose-800">
                                    {copy.title}
                                  </p>
                                  <p className="text-xs text-rose-600 leading-relaxed mt-0.5">
                                    {withNotificationPeriod(copy.body)}
                                  </p>
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      }

                      if (row.kind === 'merged_new') {
                        const copy = mergedNewProfileNotificationCopy(
                          row.displayName,
                          row.origin
                        );
                        return (
                          <li key={row.key}>
                            <button
                              type="button"
                              onClick={() => openMergedNew(row)}
                              className={`w-full text-left px-3 py-3 border-b transition-colors ${notifToneClass('new')}`}
                            >
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 relative w-8 h-8 rounded-full bg-[#c4a482] text-white flex items-center justify-center shrink-0">
                                  <Heart
                                    className="w-3.5 h-3.5"
                                    fill="currentColor"
                                  />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-stone-900">
                                    {copy.title}
                                  </p>
                                  <p className="text-xs text-stone-700 leading-relaxed mt-0.5">
                                    {withNotificationPeriod(copy.body)}
                                  </p>
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      }

                      if (row.kind === 'cat_new') {
                        const slice = sliceDigestPeople(discoverPeople);
                        const copy = newProfilesNotificationCopy(
                          discoverPeople.map((p) => p.name)
                        );
                        return (
                          <DigestNamedRow
                            key={row.key}
                            title={copy.title}
                            body={copy.body}
                            people={slice.shown}
                            extra={slice.extra}
                            photos={actorPhotos}
                            initialClass="bg-[#c4a482]"
                            titleClass="text-stone-900"
                            bodyClass="text-stone-700"
                            toneClass={notifToneClass('new')}
                            onOpenAll={() =>
                              openCategory('new', discoverPinIds)
                            }
                            onOpenPerson={(id) => openDigestPerson('new', id)}
                            icon={
                              <span className="mt-0.5 relative w-8 h-8 rounded-full bg-[#c4a482] text-white flex items-center justify-center shrink-0">
                                <Heart
                                  className="w-3.5 h-3.5"
                                  fill="currentColor"
                                />
                              </span>
                            }
                          />
                        );
                      }

                      if (row.kind === 'cat_wait') {
                        const slice = sliceDigestPeople(waitPeople);
                        const copy = waitingProfilesNotificationCopy(
                          waitPeople.map((p) => p.name)
                        );
                        return (
                          <DigestNamedRow
                            key={row.key}
                            title={copy.title}
                            body={copy.body}
                            people={slice.shown}
                            extra={slice.extra}
                            photos={actorPhotos}
                            initialClass="bg-amber-500"
                            titleClass="text-amber-950"
                            bodyClass="text-amber-900/80"
                            toneClass={notifToneClass('wait')}
                            onOpenAll={() => openCategory('wait', waitPinIds)}
                            onOpenPerson={(id) => openDigestPerson('wait', id)}
                            icon={
                              <span className="mt-0.5 relative w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                                <Sparkles className="w-3.5 h-3.5" />
                              </span>
                            }
                          />
                        );
                      }

                      if (row.kind === 'cat_first') {
                        const slice = sliceDigestPeople(firstPeople);
                        const tone = firstDigestTone(
                          firstPeople.map((p) => p.id),
                          [
                            ...peersWhoWroteToMe,
                            ...Object.entries(unreadMessages.bySender)
                              .filter(([, n]) => n > 0)
                              .map(([id]) => id),
                          ]
                        );
                        const copy = firstExchangeNotificationCopy(
                          firstPeople.map((p) => p.name),
                          tone
                        );
                        return (
                          <DigestNamedRow
                            key={row.key}
                            title={copy.title}
                            body={copy.body}
                            people={slice.shown}
                            extra={slice.extra}
                            photos={actorPhotos}
                            initialClass="bg-emerald-600"
                            titleClass="text-emerald-900"
                            bodyClass="text-emerald-800/80"
                            toneClass={notifToneClass('match')}
                            onOpenAll={() =>
                              openCategory(
                                'first',
                                quietMatches.map((m) => m.id)
                              )
                            }
                            onOpenPerson={(id) =>
                              openDigestPerson('first', id)
                            }
                            icon={
                              <span className="mt-0.5 relative w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                                <MessageCircle className="w-3.5 h-3.5" />
                              </span>
                            }
                          />
                        );
                      }

                      const n = row.n;
                      const copy = displaySocialNotification({
                        id: n.id,
                        kind: n.kind,
                        title: n.title,
                        body: n.body,
                        flash_id: n.flash_id,
                        created_at: n.created_at,
                        action_type: n.action_type,
                        interaction_type: n.interaction_type,
                        source: n.source,
                        origin: n.origin,
                        actor_name: n.actor_id
                          ? actorNames[n.actor_id] || null
                          : null,
                      });

                      return (
                        <li key={row.key}>
                          <button
                            type="button"
                            onClick={() => handleItemClick(n)}
                            className={`w-full text-left px-3 py-3 border-b transition-colors ${notifToneClass(row.tone)} ${
                              n.read_at ? 'notif-tone-read' : ''
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 notif-dot ${
                                  n.read_at ? 'opacity-0' : ''
                                }`}
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                  {copy.title}
                                </p>
                                <p className="text-xs text-gray-700/80 leading-relaxed mt-0.5">
                                  {withNotificationPeriod(copy.body)}
                                </p>
                                <p className="text-[11px] text-gray-500 mt-1">
                                  {relativeTime(n.created_at)}
                                </p>
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ))}
              </div>
            )}
            </div>
            {/* Pied dédié hors liste : scroll only, jamais de navigation */}
            <div
              className="notif-scroll-footer"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {canScrollMore ? (
                <button
                  type="button"
                  className="notif-scroll-hint"
                  aria-label="Faire défiler les notifications"
                  onClick={scrollNotificationsDown}
                >
                  <span className="notif-scroll-hint__icon" aria-hidden>
                    <ChevronDown className="w-5 h-5" strokeWidth={2.75} />
                  </span>
                </button>
              ) : (
                <div className="notif-scroll-footer-spacer" />
              )}
            </div>
          </div>
        </div>
      </>,
      document.body
    );

  return (
    <div className="relative">
      <button
        ref={bellRef}
        type="button"
        onClick={() => {
          if (
            shouldIgnoreBellClick(ignoreBellClickUntilRef.current, Date.now())
          ) {
            ignoreBellClickUntilRef.current = 0;
            return;
          }
          void handleOpen();
        }}
        className="relative p-2 rounded-xl text-gray-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
        aria-label={
          badgeCount > 0
            ? `Notifications, ${badgeCount} non lus`
            : 'Notifications'
        }
        aria-expanded={open}
      >
        <Bell className={`w-5 h-5 ${ringing ? 'bell-ring' : ''}`} />
        {badgeCount > 0 && (
          <span
            key={badgeCount}
            className={`absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ${
              ringing ? 'bell-badge-pop' : ''
            }`}
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}
