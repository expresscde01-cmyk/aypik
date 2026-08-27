import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, ChevronDown, Heart, MessageCircle, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useInboxReload, useUnreadMessages } from '@/lib/messaging';
import type { InboxUpdatedDetail } from '@/lib/messaging';
import UnreadBadge, { unreadMessagesRecapCopy } from '@/components/UnreadBadge';
import {
  displaySocialNotification,
  fetchPeersWithMessages,
  fetchSocialNotifications,
  markAllSocialNotificationsRead,
  markSocialNotificationRead,
  sweepStaleSocialNotifications,
  type SocialNotification,
} from '@/lib/suggestions';
import { isDismissedDeclinedNotification } from '@/lib/declinedArchives';
import { isWaitingNoticeDismissed } from '@/lib/waitArchives';
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
import { useMatchesInboxSync } from '@/lib/matchesInboxSync';
import { withNotificationPeriod } from '@/lib/interactionCopy';
import type { OpenMatchesOpts } from '@/lib/matchesNav';

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
    n.kind === 'match_wait_reminder'
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

function sortRowsForTone(tone: NotifTone, rows: PanelRow[]): PanelRow[] {
  return [...rows].sort((a, b) => {
    if (tone === 'wait') {
      const recapA = a.kind === 'cat_wait' ? 1 : 0;
      const recapB = b.kind === 'cat_wait' ? 1 : 0;
      if (recapA !== recapB) return recapB - recapA;
    }
    if (tone === 'match') {
      const recapA = a.kind === 'cat_first' ? 1 : 0;
      const recapB = b.kind === 'cat_first' ? 1 : 0;
      if (recapA !== recapB) return recapB - recapA;
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
    entries: inboxEntries,
    markResolved,
  } = useMatchesInboxSync();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SocialNotification[]>([]);
  const [peersWithMessages, setPeersWithMessages] = useState<Set<string>>(
    () => new Set()
  );
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [ringing, setRinging] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 16 });
  const [catNew, setCatNew] = useState<{
    count: number;
    visible: boolean;
    soleId?: string | null;
    soleName?: string | null;
    soleOrigin?: 'like' | 'flash' | null;
  } | null>(null);
  const [catWait, setCatWait] = useState<{
    count: number;
    visible: boolean;
    soleId?: string | null;
    soleName?: string | null;
  } | null>(null);
  /** Profils déjà matchés / refusés — jamais d’« À découvrir » pour eux. */
  const [resolvedActorIds, setResolvedActorIds] = useState<Set<string>>(
    () => new Set()
  );
  const [canScrollMore, setCanScrollMore] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const prevMessageTotalRef = useRef(0);
  const primedRef = useRef(false);
  const categoryPrimedRef = useRef(false);
  const lastMessageEventAtRef = useRef(0);
  const unreadMessages = useUnreadMessages();
  const [viewerGender, setViewerGender] = useState<'homme' | 'femme' | null>(
    null
  );
  const [waitSoleFetchedName, setWaitSoleFetchedName] = useState<string | null>(
    null
  );
  const [firstDismissed, setFirstDismissed] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setViewerGender(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('gender')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const gender = (data as { gender?: string | null } | null)?.gender;
      setViewerGender(
        gender === 'homme' || gender === 'femme' ? gender : null
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, open]);

  /** Matchs verts Mes Matchs + résolus serveur / optimistes. */
  const isActorResolved = (id: string | null | undefined) => {
    if (!id) return false;
    return resolvedActorIds.has(id) || matchedIds.has(id);
  };

  /** Snapshot Mes Matchs publié → digests dérivés des cartes, pas du compteur serveur. */
  const syncHasSnapshot = inboxEntries.length > 0;

  const syncCatNew = useMemo(() => {
    if (!syncHasSnapshot || !user) return null;
    const pending = inboxEntries.filter(
      (e) => e.status === 'new' && !matchedIds.has(e.id)
    );
    if (pending.length === 0) return null;
    const dismissed =
      sessionStorage.getItem(categoryNotifSessionKey(user.id, 'new')) === '1';
    return {
      count: pending.length,
      visible: !dismissed,
      soleId: pending.length === 1 ? pending[0].id : null,
      soleName: pending.length === 1 ? pending[0].displayName : null,
      soleOrigin: pending.length === 1 ? pending[0].origin : null,
    };
  }, [syncHasSnapshot, inboxEntries, matchedIds, user]);

  const syncCatWait = useMemo(() => {
    if (!syncHasSnapshot || !user) return null;
    const waiting = inboxEntries.filter(
      (e) => e.status === 'wait' && !matchedIds.has(e.id)
    );
    if (waiting.length === 0) return null;
    const dismissed =
      sessionStorage.getItem(categoryNotifSessionKey(user.id, 'wait')) === '1';
    return {
      count: waiting.length,
      visible: !dismissed,
      soleId: waiting.length === 1 ? waiting[0].id : null,
      soleName: waiting.length === 1 ? waiting[0].displayName : null,
    };
  }, [syncHasSnapshot, inboxEntries, matchedIds, user]);

  const activeCatNew = syncHasSnapshot
    ? syncCatNew
    : catNew && catNew.soleId && isActorResolved(catNew.soleId)
      ? null
      : catNew;
  const activeCatWait = syncHasSnapshot ? syncCatWait : catWait;

  const quietMatches = useMemo(() => {
    if (syncHasSnapshot) {
      return inboxEntries
        .filter((e) => e.status === 'matched')
        .map((e) => ({
          id: e.id,
          displayName: e.displayName,
        }));
    }
    const seen = new Map<string, { id: string; displayName: string }>();
    for (const n of items) {
      if (n.kind !== 'match_created' || !n.actor_id) continue;
      if (peersWithMessages.has(n.actor_id)) continue;
      if ((unreadMessages.bySender[n.actor_id] || 0) > 0) continue;
      if (seen.has(n.actor_id)) continue;
      const named = (actorNames[n.actor_id] || '').trim();
      seen.set(n.actor_id, {
        id: n.actor_id,
        displayName: named || 'Quelqu’un',
      });
    }
    return [...seen.values()];
  }, [
    syncHasSnapshot,
    inboxEntries,
    items,
    peersWithMessages,
    unreadMessages.bySender,
    actorNames,
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

  const isVisibleSocial = (n: SocialNotification) => {
    if (n.kind === 'message_received') return false;
    if (isDismissedDeclinedNotification(n, user?.id)) return false;
    if (isWaitingNoticeDismissed(n, user?.id)) return false;
    if (n.read_at) return false;
    // Jamais de Flash/Like « à découvrir » si le profil est déjà matché / refusé
    if (
      (n.kind === 'flash_received' ||
        n.kind === 'like_received' ||
        n.kind === 'match_wait_reminder') &&
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

  const socialItems = items.filter(isVisibleSocial);
  const hasWaitReminder = socialItems.some(
    (n) => n.kind === 'match_wait_reminder'
  );
  const socialOnlyUnread = items.filter(
    (n) => !n.read_at && isVisibleSocial(n)
  ).length;
  const hasNewAlert = Boolean(activeCatNew?.visible);
  const hasWaitAlert = Boolean(activeCatWait?.visible) && !hasWaitReminder;

  /** Like/Flash non traités (liste cloche) ∪ compteur inbox « nouveaux ». */
  const discoverRecapCount = useMemo(() => {
    const actors = new Set<string>();
    for (const n of socialItems) {
      if (n.kind !== 'flash_received' && n.kind !== 'like_received') continue;
      if (!n.actor_id || isActorResolved(n.actor_id)) continue;
      actors.add(n.actor_id);
    }
    return Math.max(actors.size, activeCatNew?.count ?? 0);
  }, [socialItems, activeCatNew?.count, resolvedActorIds, matchedIds]);

  /** Like/Flash individuels restent au-dessus ; le récap « Tu as ces… ci-dessus » les relie. */
  const mergeNewWithSocial = getMergeNewWithSocial();

  const categoryUnread =
    (hasNewAlert && !mergeNewWithSocial ? 1 : 0) +
    (hasWaitAlert ? 1 : 0) +
    (hasFirstAlert ? 1 : 0);
  const badgeCount =
    unreadMessages.total + socialOnlyUnread + categoryUnread;
  const hasMessageAlert = unreadMessages.total > 0;
  const showMarkAll = socialOnlyUnread > 0 || categoryUnread > 0;

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
          count: activeCatWait.count,
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
    mergeNewWithSocial,
    unreadMessages.total,
    resolvedActorIds,
    matchedIds,
  ]);

  const refreshCategoryNotifs = useCallback(async () => {
    if (!user) {
      setCatNew(null);
      setCatWait(null);
      setResolvedActorIds(new Set());
      return;
    }
    try {
      const { newCount, waitCount, soleNew, soleWait, resolvedActorIds: resolved } =
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

      const newDismissed =
        sessionStorage.getItem(categoryNotifSessionKey(user.id, 'new')) ===
        '1';
      const waitDismissed =
        sessionStorage.getItem(categoryNotifSessionKey(user.id, 'wait')) ===
        '1';

      setCatNew(
        newCount > 0 && !soleResolved
          ? {
              count: newCount,
              visible: !newDismissed,
              soleId: soleNew?.id ?? null,
              soleName: soleNew?.displayName ?? null,
              soleOrigin: soleNew?.origin ?? null,
            }
          : null
      );
      // Compteur à 0 → plus jamais de digest « À découvrir » fantôme
      if (newCount <= 0 && user) {
        sessionStorage.removeItem(categoryNotifSessionKey(user.id, 'new'));
      }
      setCatWait(
        waitCount > 0
          ? {
              count: waitCount,
              visible: !waitDismissed,
              soleId: soleWait?.id ?? null,
              soleName: soleWait?.displayName ?? null,
            }
          : null
      );
      if (waitCount <= 0 && user) {
        sessionStorage.removeItem(categoryNotifSessionKey(user.id, 'wait'));
      }

      const anyVisible =
        (newCount > 0 && !soleResolved && !newDismissed) ||
        (waitCount > 0 && !waitDismissed);
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
      const [list, peers] = await Promise.all([
        fetchSocialNotifications(25),
        fetchPeersWithMessages(),
      ]);
      setPeersWithMessages(peers);
      setItems(
        list.filter(
          (n) =>
            !isDismissedDeclinedNotification(n, user?.id) &&
            !isWaitingNoticeDismissed(n, user?.id)
        )
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
        setActorNames(map);
      } else {
        setActorNames({});
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
      } else if (decision === 'reset') {
        markResolved(actorId, 'new');
        setItems((prev) =>
          prev.filter(
            (n) =>
              !(
                n.actor_id === actorId && n.kind === 'match_wait_reminder'
              )
          )
        );
        setCatWait((prev) => {
          if (!prev?.visible) return prev;
          if (prev.count <= 1) return null;
          return { ...prev, count: prev.count - 1 };
        });
      }

      if (decision === 'match' || decision === 'refuse') {
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
        setCatNew((prev) => {
          if (!prev?.visible) return prev;
          if (prev.soleId === actorId || prev.count <= 1) return null;
          return {
            ...prev,
            count: Math.max(0, prev.count - 1),
            soleId: null,
            soleName: null,
            soleOrigin: null,
          };
        });
        if (decision === 'match') {
          setCatWait((prev) => {
            if (!prev?.visible) return prev;
            if (prev.count <= 1) return null;
            return { ...prev, count: prev.count - 1 };
          });
        }
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
        setCatNew((prev) => {
          if (!prev?.visible) return prev;
          if (prev.soleId === actorId || prev.count <= 1) return null;
          return {
            ...prev,
            count: Math.max(0, prev.count - 1),
            soleId: null,
            soleName: null,
            soleOrigin: null,
          };
        });
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
    setResolvedActorIds(new Set());
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
        () => {
          void refresh();
          void refreshCategoryNotifs();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, active, refresh, refreshCategoryNotifs]);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  const openMessageInbox = () => {
    closePanel();
    const senders = Object.entries(unreadMessages.bySender).filter(
      ([, n]) => n > 0
    );
    const only = senders.length === 1 ? senders[0][0] : null;
    onOpenInbox?.(only, Boolean(only));
  };

  const placePanel = () => {
    const rect = bellRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPanelPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  const handleOpen = async () => {
    const next = !open;
    if (next) {
      placePanel();
      setOpen(true);
      setLoading(true);
      await refresh();
      setLoading(false);
    } else {
      closePanel();
    }
  };

  const dismissCategory = (category: MatchPulseCategory) => {
    if (!user) return;
    sessionStorage.setItem(categoryNotifSessionKey(user.id, category), '1');
    if (category === 'new') {
      setCatNew((prev) => (prev ? { ...prev, visible: false } : prev));
    } else if (category === 'wait') {
      setCatWait((prev) => (prev ? { ...prev, visible: false } : prev));
    } else {
      setFirstDismissed(true);
    }
  };

  const openCategory = (category: MatchPulseCategory) => {
    closePanel();
    dismissCategory(category);
    onOpenInbox?.(null, { pulseCategory: category });
  };

  const openMergedNew = (row: Extract<PanelRow, { kind: 'merged_new' }>) => {
    closePanel();
    dismissCategory('new');
    setItems((prev) => prev.filter((x) => x.id !== row.socialId));
    onOpenInbox?.(row.actorId, { highlight: false, pulseCategory: 'new' });
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
    closePanel();
    if (isInboxNotification(n)) {
      const actorLabel =
        (n.actor_id && actorNames[n.actor_id]?.trim()) || null;
      const reminderName = actorLabel;
      const isWaitReminder = n.kind === 'match_wait_reminder';

      if (n.kind === 'message_received') {
        onOpenInbox?.(n.actor_id, true);
      } else if (n.kind === 'flash_received' || n.kind === 'like_received') {
        onOpenInbox?.(n.actor_id, { highlight: false });
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
          onPointerDown={closePanel}
        />
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed z-[90] w-[min(100vw-2rem,20rem)] rounded-2xl border border-gray-100 bg-white shadow-xl shadow-gray-200/80 overflow-hidden animate-fadeIn"
          style={{ top: panelPos.top, right: panelPos.right }}
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
                        const count = discoverRecapCount || row.count;
                        const soleName =
                          count === 1
                            ? row.soleName ||
                              (row.soleId ? actorNames[row.soleId] : null)
                            : null;
                        const copy = newProfilesNotificationCopy(
                          count,
                          soleName,
                          viewerGender
                        );
                        return (
                          <li key={row.key}>
                            <button
                              type="button"
                              onClick={() => openCategory('new')}
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

                      if (row.kind === 'cat_wait') {
                        const copy = waitingProfilesNotificationCopy(
                          row.count,
                          viewerGender,
                          row.count === 1
                            ? waitSoleFetchedName ||
                              row.soleName ||
                              (row.soleId ? actorNames[row.soleId] : null)
                            : null
                        );
                        return (
                          <li key={row.key}>
                            <button
                              type="button"
                              onClick={() => openCategory('wait')}
                              className={`w-full text-left px-3 py-3 border-b transition-colors ${notifToneClass('wait')}`}
                            >
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 relative w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                                  <Sparkles className="w-3.5 h-3.5" />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-amber-950">
                                    {copy.title}
                                  </p>
                                  <p className="text-xs text-amber-900/80 leading-relaxed mt-0.5">
                                    {withNotificationPeriod(copy.body)}
                                  </p>
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      }

                      if (row.kind === 'cat_first') {
                        const copy = firstExchangeNotificationCopy(
                          row.count,
                          row.count === 1
                            ? row.soleName ||
                              (row.soleId ? actorNames[row.soleId] : null)
                            : null
                        );
                        return (
                          <li key={row.key}>
                            <button
                              type="button"
                              onClick={() => openCategory('first')}
                              className={`w-full text-left px-3 py-3 border-b transition-colors ${notifToneClass('match')}`}
                            >
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 relative w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-emerald-900">
                                    {copy.title}
                                  </p>
                                  <p className="text-xs text-emerald-800/80 leading-relaxed mt-0.5">
                                    {withNotificationPeriod(copy.body)}
                                  </p>
                                </div>
                              </div>
                            </button>
                          </li>
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
        onClick={() => void handleOpen()}
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
