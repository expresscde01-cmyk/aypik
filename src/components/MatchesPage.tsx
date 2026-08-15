import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, MapPin, AlertCircle, MessageCircle, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  ageFromBirthDate,
  isWithinAgeGap,
  MIN_USER_AGE,
} from '@/lib/dating';
import { useMembership } from '@/lib/useMembership';
import { isFounderPeriodActive } from '@/lib/membership';
import type { Profile } from '@/components/ProfileSetup';
import { FounderBadge, BoostedBadge } from '@/components/membership/Badges';
import { SoftPremiumBanner } from '@/components/membership/SoftPremium';
import { offerLabel } from '@/lib/founderCopy';
import { userErrorMessage } from '@/lib/userError';
import {
  fetchPeersWithMessages,
  fetchSocialNotifications,
  sweepStaleSocialNotifications,
} from '@/lib/suggestions';
import {
  formatInteractionDate,
  matchRoleFromDates,
  matchedHistoryLabel,
  matchedNoDialogueLabel,
  matchedWithDialogueLabel,
  pendingToDecideLabel,
  originHistoryLabel,
  waitingMatchReminder,
  type MatchRole,
} from '@/lib/interactionCopy';
import type { ProfileGender } from '@/components/ProfileSetup';
import ChatScreen from '@/components/ChatScreen';
import MatcherButton from '@/components/MatcherButton';
import RefuseButton from '@/components/RefuseButton';
import ProfileDetailModal from '@/components/ProfileDetailModal';
import { useInboxReload, useUnreadMessages } from '@/lib/messaging';
import {
  fetchInboxResponses,
  respondToInboxInterest,
  type InboxDecision,
} from '@/lib/inboxResponses';
import type { MatchPulseCategory } from '@/lib/pendingStudy';
import {
  useMatchesInboxSync,
  type MatchesInboxEntry,
  type MatchesInboxStatus,
} from '@/lib/matchesInboxSync';

type MatchKind = 'match' | 'flash' | 'like';
/** `flashes` table = Flash (éclair). Incoming like only = Like (cœur). */
type ReceivedOrigin = 'flash' | 'like';

interface Match {
  profile: Profile;
  age: number;
  /** Date de réception du Like/Flash (ou du match). */
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
  is_founder?: boolean;
  founder_number?: number | null;
  is_boosted?: boolean;
}

type MatchFloor = 'new' | 'wait' | 'matched-quiet' | 'matched-chat';

function sortByDateReceivedAsc(a: Match, b: Match): number {
  const ta = new Date(a.date_received).getTime() || 0;
  const tb = new Date(b.date_received).getTime() || 0;
  return ta - tb;
}

function ColorChip({
  label,
  tone,
}: {
  label: string;
  tone: MatchFloor;
}) {
  const toneClass =
    tone === 'new'
      ? 'match-chip-new'
      : tone === 'wait'
        ? 'match-chip-wait'
        : tone === 'matched-quiet'
          ? 'match-chip-matched-quiet'
          : 'match-chip-matched-chat';
  return (
    <span className={`match-intro-chip ${toneClass}`}>{label}</span>
  );
}

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

export default function MatchesPage({
  focusActorId = null,
  focusOpenChat = false,
  focusHighlight = false,
  focusHintName = null,
  focusPulsePendingAll = false,
  focusPulseCategory = null,
  focusKey = 0,
  onChatClosed,
  onFocusActorConsumed,
}: {
  focusActorId?: string | null;
  focusOpenChat?: boolean;
  focusHighlight?: boolean;
  focusHintName?: string | null;
  /** @deprecated Préférer focusPulseCategory */
  focusPulsePendingAll?: boolean;
  focusPulseCategory?: MatchPulseCategory | null;
  /** Change à chaque navigation cloche → rejoue scroll / ouverture fiche. */
  focusKey?: number;
  onChatClosed?: () => void;
  onFocusActorConsumed?: () => void;
} = {}) {
  const { user } = useAuth();
  const { status, refresh: refreshMembership } = useMembership();
  const { publish, markResolved } = useMatchesInboxSync();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatPeer, setChatPeer] = useState<Profile | null>(null);
  const [openProfile, setOpenProfile] = useState<Match | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  /** Clignotement ponctuel (Attendre manuel ou rappel notif) — jusqu’à quitter la page. */
  const [pulseSingleId, setPulseSingleId] = useState<string | null>(null);
  /** Clignotement exclusif catégorie A (new) ou B (wait). */
  const [pulseCategory, setPulseCategory] = useState<MatchPulseCategory | null>(
    null
  );
  const [peersWithChat, setPeersWithChat] = useState<Set<string>>(
    () => new Set()
  );
  const [myGender, setMyGender] = useState<ProfileGender | null>(null);
  const pendingFocusRef = useRef<{
    actorId: string;
    openChat: boolean;
    highlight: boolean;
    hintName: string | null;
    pulseCategory: MatchPulseCategory | null;
  } | null>(null);
  const unread = useUnreadMessages(user?.id, {
    ignoreSenderId: chatPeer?.id ?? null,
    channelKey: 'matches-list',
  });

  const founderActive = isFounderPeriodActive(status);
  const likesUnlimited = status.unlimited_likes || founderActive;
  const likesExhausted =
    !likesUnlimited && (status.likes_remaining_today ?? 0) <= 0;

  const loadMatches = useCallback(async () => {
    if (!user) return;
    try {
      await sweepStaleSocialNotifications();

      const { data: meRow } = await supabase
        .from('profiles')
        .select('birth_date, gender')
        .eq('id', user.id)
        .maybeSingle();

      const myAge = meRow?.birth_date
        ? ageFromBirthDate(meRow.birth_date as string)
        : null;
      const genderRaw = meRow?.gender;
      setMyGender(
        genderRaw === 'homme' || genderRaw === 'femme' ? genderRaw : null
      );

      const [sentRes, receivedRes, flashRes, sentFlashRes] = await Promise.all([
        supabase
          .from('likes')
          .select('to_user, created_at')
          .eq('from_user', user.id),
        supabase
          .from('likes')
          .select('from_user, created_at')
          .eq('to_user', user.id),
        supabase
          .from('flashes')
          .select('from_user, created_at')
          .eq('to_user', user.id),
        supabase
          .from('flashes')
          .select('to_user, created_at')
          .eq('from_user', user.id),
      ]);

      if (sentRes.error) throw sentRes.error;
      if (receivedRes.error) throw receivedRes.error;
      if (flashRes.error) throw flashRes.error;
      if (sentFlashRes.error) throw sentFlashRes.error;

      const sentLikes = sentRes.data || [];
      const receivedLikes = [...(receivedRes.data || [])];
      const incomingFlashes = [...(flashRes.data || [])];
      const outgoingFlashMap = new Map(
        (sentFlashRes.data || []).map((f) => [f.to_user, f.created_at])
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
              incomingFlashes.push({
                from_user: actorId,
                created_at: n.created_at,
              });
            }
          } else if (
            n.kind === 'like_received' ||
            n.kind === 'match_created' ||
            /nouveau like/i.test(n.title) ||
            /envoyé un like/i.test(n.body)
          ) {
            if (!receivedLikes.some((l) => l.from_user === actorId)) {
              receivedLikes.push({
                from_user: actorId,
                created_at: n.created_at,
              });
            }
          }
        }
      } catch {
        /* likes / flashes restent la source principale */
      }

      let inboxRes: Awaited<ReturnType<typeof fetchInboxResponses>> = [];
      try {
        inboxRes = await fetchInboxResponses();
      } catch {
        inboxRes = [];
      }

      const incomingFlashMap = new Map(
        incomingFlashes.map((f) => [f.from_user, f.created_at])
      );
      const receivedLikeMap = new Map(
        receivedLikes.map((rl) => [rl.from_user, rl.created_at])
      );

      const originOf = (id: string): { origin: ReceivedOrigin; at: string } => {
        const flashAt = incomingFlashMap.get(id);
        if (flashAt) {
          return { origin: 'flash', at: flashAt };
        }
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
          const role = matchRoleFromDates(mine, theirs);
          return {
            id: rl.from_user,
            at: theirs,
            origin: src.origin,
            matchedBackAt: mine || rl.created_at,
            matchRole: role,
          };
        });
      const matchIdSet = new Set(matchEntries.map((m) => m.id));

      for (const f of incomingFlashes) {
        if (matchIdSet.has(f.from_user) || !sentSet.has(f.from_user)) continue;
        const mine = myFirstAt(f.from_user);
        const role = matchRoleFromDates(mine, f.created_at);
        matchEntries.push({
          id: f.from_user,
          at: f.created_at,
          origin: 'flash',
          matchedBackAt: mine || f.created_at,
          matchRole: role,
        });
        matchIdSet.add(f.from_user);
      }

      const flashEntries: { id: string; at: string }[] = incomingFlashes
        .filter((f) => !matchIdSet.has(f.from_user))
        .map((f) => ({ id: f.from_user, at: f.created_at }));
      const flashIdSet = new Set(flashEntries.map((f) => f.id));

      const likeEntries: { id: string; at: string }[] = receivedLikes
        .filter(
          (rl) => !matchIdSet.has(rl.from_user) && !flashIdSet.has(rl.from_user)
        )
        .map((rl) => ({ id: rl.from_user, at: rl.created_at }));

      const allIds = [
        ...new Set([
          ...matchEntries.map((m) => m.id),
          ...flashEntries.map((f) => f.id),
          ...likeEntries.map((l) => l.id),
        ]),
      ];

      if (allIds.length === 0) {
        setMatches([]);
        return;
      }

      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .in('id', allIds)
        .is('deletion_requested_at', null);

      if (profErr) throw profErr;

      const founderMap = new Map<string, number | null>();
      const boostSet = new Set<string>();

      const [{ data: memberships }, { data: boosts }] = await Promise.all([
        supabase
          .from('memberships')
          .select('user_id, is_founder, founder_number')
          .in('user_id', allIds),
        supabase
          .from('profile_boosts')
          .select('user_id')
          .in('user_id', allIds)
          .in('payment_status', ['paid', 'simulated'])
          .gt('ends_at', new Date().toISOString()),
      ]);

      (memberships || []).forEach((m) => {
        if (m.is_founder) founderMap.set(m.user_id, m.founder_number ?? null);
      });
      (boosts || []).forEach((b) => boostSet.add(b.user_id));

      const matchAt = new Map(matchEntries.map((m) => [m.id, m.at]));
      const matchOrigin = new Map(matchEntries.map((m) => [m.id, m.origin]));
      const matchBackAt = new Map(
        matchEntries.map((m) => [m.id, m.matchedBackAt])
      );
      const matchRoleMap = new Map(
        matchEntries.map((m) => [m.id, m.matchRole])
      );
      const flashAt = new Map(flashEntries.map((f) => [f.id, f.at]));
      const likeAt = new Map(likeEntries.map((l) => [l.id, l.at]));

      const refusedActors = new Set(
        inboxRes
          .filter((r) => r.decision === 'refuse')
          .map((r) => r.actor_id)
      );
      const waitingAtMap = new Map(
        inboxRes
          .filter((r) => r.decision === 'wait')
          .map((r) => [r.actor_id, r.updated_at] as const)
      );
      const waitingActors = new Set(waitingAtMap.keys());

      let peersChat = new Set<string>();
      try {
        peersChat = await fetchPeersWithMessages();
      } catch {
        peersChat = new Set();
      }
      setPeersWithChat(peersChat);

      const list: Match[] = (profiles || [])
        .map((row) => {
          const p = row as Profile;
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
          const matchRole =
            matchRoleMap.get(p.id) || matchRoleFromDates(mine, theirs);
          const isMatched = kind === 'match';
          return {
            profile: p,
            age: ageFromBirthDate(p.birth_date),
            date_received: at || '',
            matched_at: at || '',
            kind,
            origin,
            matchedBackAt: matchBackAt.get(p.id) || mine || null,
            alreadyLiked: sentSet.has(p.id),
            matchRole,
            waiting: !isMatched && waitingActors.has(p.id),
            waitingAt: waitingAtMap.get(p.id) ?? null,
            refused: false,
            is_founder: founderMap.has(p.id),
            founder_number: founderMap.get(p.id) ?? null,
            is_boosted: boostSet.has(p.id),
          };
        })
        .filter((m) => !refusedActors.has(m.profile.id))
        .filter((m) => isInboxEligible(myAge, m.age))
        .sort((a, b) => {
          const ta = new Date(a.date_received).getTime() || 0;
          const tb = new Date(b.date_received).getTime() || 0;
          // Plus anciens à gauche, plus récents à droite
          return ta - tb;
        });

      setMatches(list);
      setOpenProfile((open) => {
        if (!open) return open;
        return list.find((m) => m.profile.id === open.profile.id) ?? open;
      });
    } catch (err) {
      setError(userErrorMessage(err));
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      await loadMatches();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadMatches]);

  useEffect(() => {
    const refreshInbox = () => {
      if (document.visibilityState === 'visible') void loadMatches();
    };
    window.addEventListener('focus', refreshInbox);
    document.addEventListener('visibilitychange', refreshInbox);
    return () => {
      window.removeEventListener('focus', refreshInbox);
      document.removeEventListener('visibilitychange', refreshInbox);
    };
  }, [loadMatches]);

  useInboxReload(() => {
    void loadMatches();
    void unread.refresh();
  });

  useEffect(() => {
    if (!focusKey) return;
    const resolvedCategory: MatchPulseCategory | null =
      focusPulseCategory ?? (focusPulsePendingAll ? 'new' : null);
    if (
      !focusActorId &&
      !focusHintName &&
      !resolvedCategory &&
      !focusHighlight
    ) {
      return;
    }
    pendingFocusRef.current = {
      actorId: focusActorId || '',
      openChat: focusOpenChat,
      highlight: focusHighlight,
      hintName: focusHintName,
      pulseCategory: resolvedCategory,
    };
  }, [
    focusActorId,
    focusOpenChat,
    focusHighlight,
    focusHintName,
    focusPulseCategory,
    focusPulsePendingAll,
    focusKey,
  ]);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending || loading) return;

    if (pending.pulseCategory) {
      pendingFocusRef.current = null;
      onFocusActorConsumed?.();
      // Exclusif : A remplace B et inversement
      setPulseCategory(pending.pulseCategory);
      setPulseSingleId(null);
      setOpenProfile(null);
      window.setTimeout(() => {
        const target =
          pending.pulseCategory === 'wait'
            ? matches.find((m) => m.waiting)
            : matches.find(
                (m) =>
                  m.kind !== 'match' && !m.alreadyLiked && !m.waiting
              );
        if (target) {
          document
            .getElementById(`match-card-${target.profile.id}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 60);
      return;
    }

    const byId = pending.actorId
      ? matches.find((m) => m.profile.id === pending.actorId)
      : undefined;
    const waitingList = matches.filter((m) => m.waiting);
    const isActionablePending = (m: Match) =>
      m.waiting || (m.kind !== 'match' && !m.alreadyLiked);

    let found: Match | undefined;
    if (pending.highlight) {
      if (byId && isActionablePending(byId)) {
        found = byId;
      } else if (pending.hintName) {
        const needle = pending.hintName.toLowerCase();
        found =
          waitingList.find(
            (m) => m.profile.display_name.trim().toLowerCase() === needle
          ) ||
          waitingList.find((m) =>
            m.profile.display_name.trim().toLowerCase().includes(needle)
          ) ||
          matches.find(
            (m) =>
              isActionablePending(m) &&
              m.profile.display_name.trim().toLowerCase() === needle
          );
      } else if (waitingList.length === 1) {
        found = waitingList[0];
      }
    } else {
      found = byId;
    }

    if (!found) return;

    pendingFocusRef.current = null;
    onFocusActorConsumed?.();

    if (
      pending.openChat &&
      (found.kind === 'match' || found.alreadyLiked)
    ) {
      setChatPeer(found.profile);
      return;
    }

    if (pending.highlight) {
      // Rappel individuel : exclusif catégorie B, une seule carte
      setPulseCategory(null);
      setPulseSingleId(found.profile.id);
      window.setTimeout(() => {
        document
          .getElementById(`match-card-${found.profile.id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
      setOpenProfile(found);
      return;
    }

    setOpenProfile(found);
  }, [
    loading,
    matches,
    focusActorId,
    focusOpenChat,
    focusHighlight,
    focusHintName,
    focusPulseCategory,
    focusPulsePendingAll,
    focusKey,
    onFocusActorConsumed,
  ]);

  const handleMatchBack = useCallback(
    async (item: Match) => {
      if (
        !user ||
        actingId ||
        likesExhausted ||
        item.alreadyLiked ||
        item.kind === 'match'
      ) {
        return;
      }
      setActingId(item.profile.id);
      setError(null);
      try {
        await respondToInboxInterest(item.profile.id, 'match', item.origin);
        const confirmed: Match = {
          ...item,
          kind: 'match',
          alreadyLiked: true,
          waiting: false,
          waitingAt: null,
          refused: false,
          matchRole: 'accepted',
          matchedBackAt: new Date().toISOString(),
        };
        setMatches((prev) =>
          prev.map((m) => (m.profile.id === item.profile.id ? confirmed : m))
        );
        markResolved(item.profile.id, 'matched');
        setPulseCategory(null);
        setPulseSingleId(null);
        setOpenProfile(null);
        await Promise.all([loadMatches(), refreshMembership()]);
      } catch (err) {
        setError(userErrorMessage(err, 'Impossible de valider le match'));
      } finally {
        setActingId(null);
      }
    },
    [user, actingId, likesExhausted, loadMatches, refreshMembership, markResolved]
  );

  const handleInboxDecision = useCallback(
    async (item: Match, decision: InboxDecision) => {
      if (!user || actingId) return;
      if (decision === 'match' && likesExhausted) return;
      if (item.kind === 'match' || item.alreadyLiked) return;
      if (item.waiting && decision === 'wait') return;

      if (decision === 'match') {
        await handleMatchBack(item);
        return;
      }

      setActingId(item.profile.id);
      setError(null);
      try {
        await respondToInboxInterest(item.profile.id, decision, item.origin);
        if (decision === 'refuse') {
          setMatches((prev) =>
            prev.filter((m) => m.profile.id !== item.profile.id)
          );
          markResolved(item.profile.id, 'refused');
          setPulseCategory(null);
          setPulseSingleId((id) =>
            id === item.profile.id ? null : id
          );
        } else {
          const waiting: Match = {
            ...item,
            waiting: true,
            waitingAt: new Date().toISOString(),
            refused: false,
          };
          setMatches((prev) =>
            prev.map((m) => (m.profile.id === item.profile.id ? waiting : m))
          );
          markResolved(item.profile.id, 'wait');
          // Clignotement ponctuel exclusif de ce profil (catégorie B)
          setPulseCategory(null);
          setPulseSingleId(item.profile.id);
        }
        setOpenProfile(null);
        await loadMatches();
      } catch (err) {
        setError(userErrorMessage(err, 'Impossible d’enregistrer ta réponse'));
      } finally {
        setActingId(null);
      }
    },
    [user, actingId, likesExhausted, loadMatches, handleMatchBack, markResolved]
  );

  const floors = useMemo(() => {
    const buckets: Record<MatchFloor, Match[]> = {
      new: [],
      wait: [],
      'matched-quiet': [],
      'matched-chat': [],
    };
    for (const match of matches) {
      const isPending = match.kind !== 'match';
      const isMatched = !isPending || match.alreadyLiked;
      const hasDialogue =
        peersWithChat.has(match.profile.id) ||
        (unread.bySender[match.profile.id] || 0) > 0;
      let floor: MatchFloor;
      if (match.waiting) floor = 'wait';
      else if (isMatched) floor = hasDialogue ? 'matched-chat' : 'matched-quiet';
      else floor = 'new';
      buckets[floor].push(match);
    }
    return {
      new: buckets.new.sort(sortByDateReceivedAsc),
      wait: buckets.wait.sort(sortByDateReceivedAsc),
      matchedQuiet: buckets['matched-quiet'].sort(sortByDateReceivedAsc),
      matchedChat: buckets['matched-chat'].sort(sortByDateReceivedAsc),
    };
  }, [matches, peersWithChat, unread.bySender]);

  /** Source de vérité pour la cloche : états des cartes Mes Matchs. */
  useEffect(() => {
    const next: MatchesInboxEntry[] = matches.map((match) => {
      const isPending = match.kind !== 'match';
      const isMatched = !isPending || match.alreadyLiked;
      const hasDialogue =
        peersWithChat.has(match.profile.id) ||
        (unread.bySender[match.profile.id] || 0) > 0;
      let status: MatchesInboxStatus;
      if (match.waiting) status = 'wait';
      else if (isMatched) status = hasDialogue ? 'matched-chat' : 'matched';
      else status = 'new';
      return {
        id: match.profile.id,
        displayName: (match.profile.display_name || '').trim() || 'Quelqu’un',
        status,
        origin: match.origin,
      };
    });
    publish(next);
  }, [matches, peersWithChat, unread.bySender, publish]);

  const renderMatchCard = (match: Match) => {
    const isPending = match.kind !== 'match';
    const isFlash = match.origin === 'flash';
    const isMatched = !isPending || match.alreadyLiked;
    const unreadCount = unread.bySender[match.profile.id] || 0;
    const showChatButton = !isPending || unreadCount > 0;
    const hasDialogue =
      peersWithChat.has(match.profile.id) || unreadCount > 0;
    const matchDateIso =
      match.matchRole === 'initiated'
        ? match.matched_at
        : match.matchedBackAt || match.matched_at;
    const statusLabel = match.waiting
      ? waitingMatchReminder(match.origin, myGender)
      : isMatched
        ? hasDialogue
          ? matchedWithDialogueLabel(matchDateIso, match.matchRole)
          : matchedNoDialogueLabel(matchDateIso, match.matchRole)
        : pendingToDecideLabel(match.origin, match.date_received);

    const receivedLabel = formatInteractionDate(match.date_received);
    const isToStudy = isPending && !match.waiting && !match.alreadyLiked;
    const shouldPulse = match.waiting
      ? pulseCategory === 'wait' || pulseSingleId === match.profile.id
      : isToStudy &&
        (pulseCategory === 'new' || pulseSingleId === match.profile.id);

    const cardTone = (() => {
      if (match.waiting) {
        return shouldPulse
          ? 'match-card-wait match-card-attention-pulse'
          : 'match-card-wait';
      }
      if (isMatched) {
        return hasDialogue
          ? 'match-card-matched-chat'
          : 'match-card-matched-quiet';
      }
      return shouldPulse
        ? 'match-card-new match-card-attention-pulse'
        : 'match-card-new';
    })();

    return (
      <div
        id={`match-card-${match.profile.id}`}
        key={match.profile.id}
        data-match-state={
          match.waiting
            ? 'wait'
            : isMatched
              ? hasDialogue
                ? 'matched-chat'
                : 'matched-quiet'
              : 'new'
        }
        className={`rounded-2xl p-4 flex items-center gap-3 transition-shadow animate-fadeIn ${cardTone}`}
      >
        <button
          type="button"
          onClick={() => setOpenProfile(match)}
          className="relative w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-rose-100 to-amber-100 flex-shrink-0"
          aria-label={`Voir le profil de ${match.profile.display_name}`}
        >
          {match.profile.photo_url ? (
            <img
              src={match.profile.photo_url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-rose-400">
              {match.profile.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          {isFlash && isPending && (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-amber-400 text-white flex items-center justify-center shadow-sm">
              <Zap className="w-3 h-3" fill="currentColor" aria-hidden />
            </span>
          )}
          {!isFlash && isPending && (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-sm">
              <Heart className="w-3 h-3" fill="currentColor" aria-hidden />
            </span>
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -left-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center unread-badge-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">
              {match.profile.display_name}
            </h3>
            <span className="text-sm text-gray-400">{match.age} ans</span>
            {match.is_boosted && <BoostedBadge size="sm" />}
            {match.is_founder && (
              <FounderBadge number={match.founder_number} size="sm" />
            )}
          </div>
          {match.profile.location && (
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" />
              {match.profile.location}
            </p>
          )}
          {match.waiting ? (
            <>
              {receivedLabel ? (
                <p className="text-[11px] text-amber-900/70 mt-1">
                  Reçu le {receivedLabel}
                </p>
              ) : null}
              <p className="text-xs text-amber-950/80 mt-0.5">{statusLabel}</p>
            </>
          ) : isMatched ? (
            <p
              className={`text-xs mt-1 ${
                hasDialogue ? 'text-gray-600' : 'text-emerald-800'
              }`}
            >
              {statusLabel}
            </p>
          ) : (
            <p className="text-xs text-stone-700 mt-1">{statusLabel}</p>
          )}
        </div>

        {isPending && match.waiting ? (
          <div className="flex flex-col items-center justify-center gap-1 flex-shrink-0 -my-0.5">
            <MatcherButton
              name={match.profile.display_name}
              busy={actingId === match.profile.id}
              disabled={likesExhausted}
              matched={match.alreadyLiked}
              tooltip="top"
              onClick={() => void handleMatchBack(match)}
            />
            <RefuseButton
              name={match.profile.display_name}
              busy={actingId === match.profile.id}
              tooltip="top"
              onClick={() => void handleInboxDecision(match, 'refuse')}
            />
          </div>
        ) : isPending && !showChatButton ? (
          <MatcherButton
            name={match.profile.display_name}
            busy={actingId === match.profile.id}
            disabled={likesExhausted}
            matched={match.alreadyLiked}
            onClick={() => void handleMatchBack(match)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setChatPeer(match.profile)}
            className="relative w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center hover:bg-rose-100 transition-colors flex-shrink-0"
            aria-label={`Envoyer un message à ${match.profile.display_name}`}
            title="Ouvrir la messagerie"
          >
            <MessageCircle className="w-5 h-5 text-rose-500" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center unread-badge-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        )}
      </div>
    );
  };

  const renderFloor = (
    floor: MatchFloor,
    title: string,
    items: Match[]
  ) => {
    if (items.length === 0) return null;
    return (
      <section className="space-y-2" aria-label={title}>
        <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 tracking-wide">
          <ColorChip label={title} tone={floor} />
          <span className="text-gray-400 font-normal">({items.length})</span>
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((m) => renderMatchCard(m))}
        </div>
      </section>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
          <div className="text-gray-400 text-sm">Chargement de tes matchs...</div>
        </div>
      </div>
    );
  }

  if (error && matches.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 text-red-700 text-sm max-w-md">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-50 to-amber-50 flex items-center justify-center">
            <Heart className="w-9 h-9 text-rose-300 match-empty-heart" />
          </div>
          <h2
            className="text-xl font-bold text-blue-900 my-4"
            aria-label="Pas encore de match"
          >
            {Array.from('Pas encore de match').map((char, i, chars) => (
              <span
                key={i}
                aria-hidden
                className="match-title-wave-letter"
                style={{ animationDelay: `${(i / (chars.length - 1)) * 1.1}s` }}
              >
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </h2>
          <p className="text-gray-500 max-w-md font-bold not-italic">
            Continue à explorer les profils dans la section Découvrir.
          </p>
          <p className="text-gray-500 max-w-md mt-2 font-normal italic">
            Un profil apparaît ici dès qu&apos;on t&apos;envoie un flash{' '}
            <Zap
              className="w-4 h-4 inline mb-0.5 text-amber-500"
              fill="currentColor"
              aria-hidden
            />{' '}
            ou un like{' '}
            <Heart
              className="w-4 h-4 inline mb-0.5 text-rose-500"
              fill="currentColor"
              aria-hidden
            />
            . Réponds pour valider ton match.
          </p>
        </div>
        <SoftPremiumBanner
          title="Messages illimités après match"
          description={`Dès qu'il y a réciprocité, tu peux échanger librement — c’est inclus dans ${offerLabel(status)}.`}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {chatPeer && (
        <ChatScreen
          peer={chatPeer}
          onClose={() => {
            setChatPeer(null);
            void unread.refresh();
            onChatClosed?.();
          }}
        />
      )}

      <h2 className="text-xl font-bold text-gray-900 mb-1">
        Tes matchs ({matches.length})
      </h2>
      <p className="text-sm text-gray-600 mb-5 leading-relaxed">
        Tu trouveras sur cette page tous les profils qui t&apos;ont adressé un{' '}
        <ColorChip label="Like ou Flash — à statuer" tone="new" />. Tu pourras
        soit les refuser (pour qu&apos;ils disparaissent de cette page), soit
        les{' '}
        <ColorChip label="mettre en attente" tone="wait" /> (pour les étudier
        plus tard), soit les matcher pour voir ainsi ces profils passer à
        l&apos;étape des matchs. Tous tes matchs seront ensuite soit classés{' '}
        <ColorChip
          label="en attente de conversation"
          tone="matched-quiet"
        />
        , soit classés{' '}
        <ColorChip label="en cours de dialogue" tone="matched-chat" />{' '}
        lorsqu&apos;il y aura eu au moins un échange.
      </p>

      {error && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Étages du haut vers le bas : dialogue → match quiet → attente → à statuer */}
      <div className="space-y-6">
        {renderFloor(
          'matched-chat',
          'Dialogue en cours',
          floors.matchedChat
        )}
        {renderFloor(
          'matched-quiet',
          'Match — en attente de conversation',
          floors.matchedQuiet
        )}
        {renderFloor('wait', 'Mis en attente', floors.wait)}
        {renderFloor('new', 'Like / Flash à statuer', floors.new)}
      </div>

      {openProfile && (
        <ProfileDetailModal
          candidate={{
            id: openProfile.profile.id,
            display_name: openProfile.profile.display_name,
            photo_url: openProfile.profile.photo_url,
            age: openProfile.age,
            bio: openProfile.profile.bio,
            location: openProfile.profile.location,
            interests: openProfile.profile.interests,
            is_boosted: openProfile.is_boosted,
            is_founder: openProfile.is_founder,
            founder_number: openProfile.founder_number,
          }}
          alreadyFlashed
          alreadyLiked={
            openProfile.kind === 'match' || openProfile.alreadyLiked
          }
          busy={actingId === openProfile.profile.id}
          likesExhausted={likesExhausted}
          showFlashCta={false}
          inboxHistory={{
            origin: openProfile.origin,
            originLabel: originHistoryLabel(
              openProfile.origin,
              openProfile.matched_at
            ),
            matchedLabel:
              openProfile.kind === 'match' || openProfile.alreadyLiked
                ? matchedHistoryLabel(
                    openProfile.matchRole === 'initiated'
                      ? openProfile.matched_at
                      : openProfile.matchedBackAt || openProfile.matched_at,
                    openProfile.matchRole
                  )
                : null,
            waiting: openProfile.waiting,
            refused: openProfile.refused,
            viewerGender: myGender,
          }}
          unreadCount={unread.bySender[openProfile.profile.id] || 0}
          onClose={() => setOpenProfile(null)}
          onLike={() => void handleMatchBack(openProfile)}
          onFlash={() => undefined}
          onSkip={() => setOpenProfile(null)}
          onInboxDecision={
            openProfile.kind !== 'match' && !openProfile.alreadyLiked
              ? (decision) => void handleInboxDecision(openProfile, decision)
              : undefined
          }
          onOpenChat={
            openProfile.kind === 'match' ||
            openProfile.alreadyLiked ||
            (unread.bySender[openProfile.profile.id] || 0) > 0
              ? () => {
                  setChatPeer(openProfile.profile);
                  setOpenProfile(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
