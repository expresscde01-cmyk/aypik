import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Folder, Heart, MapPin, AlertCircle, Zap, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import ChatScreen from '@/components/ChatScreen';
import {
  ageFromBirthDate,
  isWithinAgeGap,
  MIN_USER_AGE,
} from '@/lib/dating';
import { useMembership } from '@/lib/useMembership';
import { isFounderPeriodActive } from '@/lib/membership';
import { PROFILE_CARD_COLUMNS, type Profile } from '@/components/ProfileSetup';
import { FounderBadge, BoostedBadge } from '@/components/membership/Badges';
import { SoftPremiumBanner } from '@/components/membership/SoftPremium';
import { offerLabel } from '@/lib/founderCopy';
import { userErrorMessage } from '@/lib/userError';
import {
  fetchPeersWithMessages,
  fetchSocialNotifications,
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
  declinedArchiveStatusLabel,
  waitArchiveStatusLabel,
  brokenMatchStatusLabel,
  brokenMatchOriginLabel,
  type MatchRole,
} from '@/lib/interactionCopy';
import type { ProfileGender } from '@/components/ProfileSetup';
import ChatBubbleButton from '@/components/ChatBubbleButton';
import MatcherButton from '@/components/MatcherButton';
import RefuseButton from '@/components/RefuseButton';
import ArchiveButton from '@/components/ArchiveButton';
import RestoreLinkButton from '@/components/RestoreLinkButton';
import WaitButton from '@/components/WaitButton';
import ProfileDetailModal from '@/components/ProfileDetailModal';
import ProfilePhoto from '@/components/ProfilePhoto';
import { OnlinePresenceDot } from '@/components/OnlinePresenceDot';
import MatchManageModal from '@/components/MatchManageModal';
import { useInboxReload, useUnreadMessages } from '@/lib/messaging';
import {
  fetchInboxResponses,
  respondToInboxInterest,
  restoreWaitFromArchive,
  type InboxDecision,
} from '@/lib/inboxResponses';
import { type MatchPulseCategory } from '@/lib/pendingStudy';
import {
  fetchDeclinedArchives,
  fetchPendingDeclinedNotices,
  dismissDeclinedNotification,
  rememberDeclinedHandled,
  isDeclinedHandled,
  deleteDeclinedArchive,
} from '@/lib/declinedArchives';
import {
  dismissWaitingNotification,
  fetchPendingWaitingNotices,
  forgetClearedWait,
  forgetWaitArchive,
  isMineWaitArchived,
  isWaitCleared,
  listAllWaitArchives,
  releaseWaitCycle,
  rememberMineWaitArchive,
  rememberTheirsWaitArchive,
} from '@/lib/waitArchives';
import {
  useMatchesInboxSync,
  type MatchesInboxEntry,
  type MatchesInboxStatus,
} from '@/lib/matchesInboxSync';
import {
  fetchMatchBreaks,
  restoreBrokenMatch,
  purgeBrokenMatch,
  type MatchBreakAction,
} from '@/lib/matchBreaks';

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

type DeclinedArchiveCard = {
  archiveId: string;
  archivedAt: string;
  declinedAt: string;
  origin: ReceivedOrigin;
  profile: Profile;
  age: number;
  is_founder?: boolean;
  founder_number?: number | null;
  is_boosted?: boolean;
  source?: 'theirs' | 'mine';
};

type PendingDeclinedCard = {
  notificationId: string;
  declinedAt: string;
  origin: ReceivedOrigin;
  profile: Profile;
  age: number;
  is_founder?: boolean;
  founder_number?: number | null;
  is_boosted?: boolean;
};

type WaitArchiveCard = {
  archiveId: string;
  archivedAt: string;
  receivedAt: string;
  origin: ReceivedOrigin;
  profile: Profile;
  age: number;
  is_founder?: boolean;
  founder_number?: number | null;
  is_boosted?: boolean;
  source: 'mine' | 'theirs';
  notificationId?: string | null;
};

type PendingWaitingCard = {
  notificationId: string;
  receivedAt: string;
  origin: ReceivedOrigin;
  profile: Profile;
  age: number;
  is_founder?: boolean;
  founder_number?: number | null;
  is_boosted?: boolean;
};

type BrokenMatchCard = {
  archiveId: string;
  createdAt: string;
  origin: ReceivedOrigin;
  action: MatchBreakAction;
  profile: Profile;
  age: number;
  is_founder?: boolean;
  founder_number?: number | null;
  is_boosted?: boolean;
};

/** Plus récents en premier (haut/gauche), quel que soit l'étage. */
function sortByDateReceivedDesc(a: Match, b: Match): number {
  const ta = new Date(a.date_received).getTime() || 0;
  const tb = new Date(b.date_received).getTime() || 0;
  return tb - ta;
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

const PROFILE_IN_CHUNK = 80;

async function fetchByIdChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += PROFILE_IN_CHUNK) {
    const chunk = unique.slice(i, i + PROFILE_IN_CHUNK);
    const { data, error } = await run(chunk);
    if (error) throw error;
    if (data?.length) rows.push(...data);
  }
  return rows;
}

async function fetchProfileBundle(ids: string[]): Promise<{
  byId: Map<string, Profile>;
  founderMap: Map<string, number | null>;
  boostSet: Set<string>;
}> {
  if (ids.length === 0) {
    return { byId: new Map(), founderMap: new Map(), boostSet: new Set() };
  }
  const nowIso = new Date().toISOString();
  const [profiles, memberships, boosts] = await Promise.all([
    fetchByIdChunks<Profile>(ids, async (chunk) => {
      const rpc = await supabase.rpc('card_profiles', { p_ids: chunk });
      if (!rpc.error && rpc.data) {
        const rows = (rpc.data as Profile[]).map((row) => ({
          ...row,
          bio: row.bio || '',
          location: row.location || '',
          interests: row.interests || [],
          photo_url: row.photo_url || '',
          is_online: Boolean(row.is_online),
        }));
        return { data: rows, error: null };
      }
      const fb = await supabase
        .from('profiles')
        .select(PROFILE_CARD_COLUMNS)
        .in('id', chunk)
        .is('deletion_requested_at', null);
      return {
        data:
          (fb.data as Profile[] | null)?.map((p) => ({
            ...p,
            is_online: false,
          })) ?? null,
        error: fb.error,
      };
    }),
    fetchByIdChunks<{
      user_id: string;
      is_founder: boolean | null;
      founder_number: number | null;
    }>(ids, (chunk) =>
      supabase
        .from('memberships')
        .select('user_id, is_founder, founder_number')
        .in('user_id', chunk)
    ),
    fetchByIdChunks<{ user_id: string }>(ids, (chunk) =>
      supabase
        .from('profile_boosts')
        .select('user_id')
        .in('user_id', chunk)
        .in('payment_status', ['paid', 'simulated'])
        .gt('ends_at', nowIso)
    ),
  ]);
  const founderMap = new Map<string, number | null>();
  memberships.forEach((m) => {
    if (m.is_founder) founderMap.set(m.user_id, m.founder_number ?? null);
  });
  const boostSet = new Set(boosts.map((b) => b.user_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return { byId, founderMap, boostSet };
}

function scrollMatchCardIntoView(elementId: string) {
  const run = () => {
    document
      .getElementById(elementId)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  window.setTimeout(run, 80);
  window.setTimeout(run, 320);
}

function HintActionIcon({
  kind,
}: {
  kind: 'archive' | 'delete';
}) {
  return (
    <span
      className="mx-0.5 inline-flex h-[1.35rem] w-[1.35rem] shrink-0 translate-y-px items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm align-middle"
      aria-hidden
    >
      {kind === 'archive' ? (
        <Folder
          className="archive-folder h-3 w-3 text-[#FFC107]"
          strokeWidth={2.4}
        />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="refuse-trash h-3 w-3 text-gray-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <g className="refuse-trash-lid">
            <path d="M3 6h18" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </g>
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <line x1="10" x2="10" y1="11" y2="17" />
          <line x1="14" x2="14" y1="11" y2="17" />
        </svg>
      )}
    </span>
  );
}

function DeclinedActionHint({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Que faire de ce profil"
      className="absolute bottom-full left-1/2 z-30 mb-1 w-[min(calc(100vw-2rem),19rem)] -translate-x-1/2"
    >
      <div className="declined-action-hint relative px-3.5 py-3 pr-9 text-xs leading-relaxed text-gray-700">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-amber-100/70 transition-colors"
          aria-label="Fermer"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2.4} />
        </button>
        <p className="text-center">
          Tu peux soit archiver ce profil{' '}
          <HintActionIcon kind="archive" /> pour le conserver dans ta page
          &quot;Mes Matchs&quot;, soit le supprimer{' '}
          <HintActionIcon kind="delete" /> pour le faire disparaître
          définitivement de ta page.
        </p>
        <span aria-hidden className="declined-action-hint-caret" />
        <span aria-hidden className="declined-action-hint-caret-fill" />
      </div>
    </div>
  );
}

/** Infobulles des icônes de fiche : haut-droite / côté droit / bas-droite. */
type CardActionTooltip = 'logo-tr' | 'right' | 'logo';

/** Trash is always last when other icons share the stack. */
function cardActionTooltip(
  index: number,
  count: number
): CardActionTooltip {
  if (count <= 1 || index === 0) return 'logo-tr';
  if (index === count - 1) return 'logo';
  return 'right';
}

const CARD_ACTIONS_COL =
  'match-card-actions flex flex-col flex-nowrap items-center justify-center gap-1 flex-shrink-0 -my-0.5 overflow-visible';

function CardIdentity({
  name,
  age,
  isBoosted,
  isFounder,
  founderNumber,
  nameClass = 'text-gray-900',
  ageClass = 'text-gray-400',
}: {
  name: string;
  age: number;
  isBoosted?: boolean;
  isFounder?: boolean;
  founderNumber?: number | null;
  nameClass?: string;
  ageClass?: string;
}) {
  return (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <h3 className={`font-semibold truncate ${nameClass}`}>{name}</h3>
        <span className={`text-sm shrink-0 ${ageClass}`}>{age} ans</span>
      </div>
      {isBoosted ? (
        <div className="mt-0.5">
          <BoostedBadge size="sm" />
        </div>
      ) : null}
      {isFounder ? (
        <div className="mt-0.5">
          <FounderBadge number={founderNumber} size="sm" />
        </div>
      ) : null}
    </>
  );
}

export default function MatchesPage({
  focusActorId = null,
  focusOpenChat = false,
  focusHighlight = false,
  focusHintName = null,
  focusPulsePendingAll = false,
  focusPulseCategory = null,
  focusDeclined = false,
  focusWaitingIncoming = false,
  focusKey = 0,
  onChatClosed,
  onFocusActorConsumed,
  profileEpoch = 0,
  pageActive = true,
}: {
  focusActorId?: string | null;
  focusOpenChat?: boolean;
  focusHighlight?: boolean;
  focusHintName?: string | null;
  /** @deprecated Préférer focusPulseCategory */
  focusPulsePendingAll?: boolean;
  focusPulseCategory?: MatchPulseCategory | null;
  /** Navigation depuis une notif « Pas cette fois ». */
  focusDeclined?: boolean;
  /** Notif « X a mis ton Like/Flash en attente ». */
  focusWaitingIncoming?: boolean;
  /** Change à chaque navigation cloche → rejoue scroll / ouverture fiche. */
  focusKey?: number;
  onChatClosed?: () => void;
  onFocusActorConsumed?: () => void;
  profileEpoch?: number;
  /** Onglet Matchs visible : resync inbox à la réouverture, sans poll. */
  pageActive?: boolean;
} = {}) {
  const { user } = useAuth();
  const { status, refresh: refreshMembership } = useMembership();
  const { publish, markResolved } = useMatchesInboxSync();
  const [matches, setMatches] = useState<Match[]>([]);
  const [declinedArchives, setDeclinedArchives] = useState<
    DeclinedArchiveCard[]
  >([]);
  const [pendingDeclined, setPendingDeclined] = useState<PendingDeclinedCard[]>(
    []
  );
  const [waitArchives, setWaitArchives] = useState<WaitArchiveCard[]>([]);
  const [pendingWaiting, setPendingWaiting] = useState<PendingWaitingCard[]>(
    []
  );
  const [brokenMatches, setBrokenMatches] = useState<BrokenMatchCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatPeer, setChatPeer] = useState<Profile | null>(null);
  const [openProfile, setOpenProfile] = useState<Match | null>(null);
  const [openArchive, setOpenArchive] = useState<DeclinedArchiveCard | null>(
    null
  );
  const [openPendingDeclined, setOpenPendingDeclined] =
    useState<PendingDeclinedCard | null>(null);
  const [openWaitArchive, setOpenWaitArchive] = useState<WaitArchiveCard | null>(
    null
  );
  const [openPendingWaiting, setOpenPendingWaiting] =
    useState<PendingWaitingCard | null>(null);
  const [openBroken, setOpenBroken] = useState<BrokenMatchCard | null>(null);
  /** Modale compacte après « sens interdit » sur une fiche Mis en attente. */
  const [openWaitingManage, setOpenWaitingManage] = useState<Match | null>(null);
  const [brokenBusyId, setBrokenBusyId] = useState<string | null>(null);
  const restoredChatPeersRef = useRef<Set<string>>(new Set());
  const matchesLoadGen = useRef(0);
  const waitArchivesLoadGen = useRef(0);
  const restoredWaitActorsRef = useRef<Set<string>>(new Set());
  const waitCycleLockRef = useRef<Set<string>>(new Set());
  const [declinedBusyId, setDeclinedBusyId] = useState<string | null>(null);
  const declinedBusyRef = useRef(false);
  const [actingId, setActingId] = useState<string | null>(null);
  /** Clignotement ponctuel (notif / focus) — retiré dès la 1re interaction. */
  const [pulseSingleId, setPulseSingleId] = useState<string | null>(null);
  /** Infobulle « Pas cette fois » au-dessus de la fiche ciblée par la notif. */
  const [declinedActionHintId, setDeclinedActionHintId] = useState<
    string | null
  >(null);
  /** Clignotement exclusif catégorie A (new) ou B (wait). */
  const [pulseCategory, setPulseCategory] = useState<MatchPulseCategory | null>(
    null
  );
  const consumeAttentionPulse = useCallback((profileId?: string | null) => {
    setPulseSingleId((current) => {
      if (!profileId || current === profileId) return null;
      return current;
    });
    setPulseCategory(null);
    setDeclinedActionHintId((current) => {
      if (!profileId || current === profileId) return null;
      return current;
    });
  }, []);
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
    declined: boolean;
    waitingIncoming: boolean;
    attempts?: number;
  } | null>(null);
  const unread = useUnreadMessages({
    ignoreSenderId: chatPeer?.id ?? null,
  });

  const founderActive = isFounderPeriodActive(status);
  const likesUnlimited = status.unlimited_likes || founderActive;
  const likesExhausted =
    !likesUnlimited && (status.likes_remaining_today ?? 0) <= 0;

  const loadMatches = useCallback(async () => {
    if (!user) return;
    const gen = ++matchesLoadGen.current;
    try {
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
        if (
          matchIdSet.has(f.from_user) ||
          (!sentSet.has(f.from_user) && !outgoingFlashMap.has(f.from_user))
        ) {
          continue;
        }
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
        if (gen !== matchesLoadGen.current) return;
        setMatches([]);
        return;
      }

      const { byId, founderMap, boostSet } = await fetchProfileBundle(allIds);

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
      const forceWait = restoredWaitActorsRef.current;

      let peersChat = new Set<string>();
      try {
        peersChat = await fetchPeersWithMessages();
      } catch {
        peersChat = new Set();
      }
      for (const id of restoredChatPeersRef.current) peersChat.add(id);
      setPeersWithChat(peersChat);

      const list: Match[] = [...byId.values()].map((p) => {
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
          const waiting =
            !isMatched &&
            (forceWait.has(p.id) ||
              (waitingActors.has(p.id) && !isWaitCleared(user.id, p.id)));
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
            waiting,
            waitingAt: waiting ? waitingAtMap.get(p.id) ?? null : null,
            refused: false,
            is_founder: founderMap.has(p.id),
            founder_number: founderMap.get(p.id) ?? null,
            is_boosted: boostSet.has(p.id),
          };
        })
        .filter(
          (m) => forceWait.has(m.profile.id) || !refusedActors.has(m.profile.id)
        )
        .filter((m) => isInboxEligible(myAge, m.age))
        .sort((a, b) => {
          const ta = new Date(a.date_received).getTime() || 0;
          const tb = new Date(b.date_received).getTime() || 0;
          // Plus récents en premier (haut/gauche), quel que soit l'étage
          return tb - ta;
        });

      if (gen !== matchesLoadGen.current) return;
      for (const m of list) {
        if (waitingActors.has(m.profile.id)) forceWait.delete(m.profile.id);
      }
      setMatches(list);
      setOpenProfile((open) => {
        if (!open) return open;
        const next = list.find((m) => m.profile.id === open.profile.id);
        if (!next) return open;
        if (
          next.waiting === open.waiting &&
          next.refused === open.refused &&
          next.kind === open.kind
        ) {
          return open;
        }
        return next;
      });
    } catch (err) {
      setError(userErrorMessage(err));
    }
  }, [user, profileEpoch]);

  const loadDeclinedArchives = useCallback(async () => {
    if (!user) {
      setDeclinedArchives([]);
      return;
    }
    try {
      const rows = await fetchDeclinedArchives();
      if (rows.length === 0) {
        setDeclinedArchives([]);
        return;
      }
      const ids = [...new Set(rows.map((r) => r.actor_id))];
      const { byId, founderMap, boostSet } = await fetchProfileBundle(ids);

      const list: DeclinedArchiveCard[] = [];
      for (const row of rows) {
        const profile = byId.get(row.actor_id);
        if (!profile) continue;
        list.push({
          archiveId: row.id,
          archivedAt: row.archived_at,
          declinedAt: row.declined_at,
          origin: row.origin,
          profile,
          age: ageFromBirthDate(profile.birth_date),
          is_founder: founderMap.has(profile.id),
          founder_number: founderMap.get(profile.id) ?? null,
          is_boosted: boostSet.has(profile.id),
          source: row.source === 'mine' ? 'mine' : 'theirs',
        });
      }
      // Plus récents en premier (haut/gauche), quel que soit l'étage
      list.sort(
        (a, b) => Date.parse(b.archivedAt) - Date.parse(a.archivedAt)
      );
      setDeclinedArchives(list);
      setOpenArchive((open) => {
        if (!open) return open;
        return list.find((c) => c.archiveId === open.archiveId) ?? null;
      });
    } catch {
      setDeclinedArchives([]);
    }
  }, [user]);

  const loadPendingDeclined = useCallback(async () => {
    if (!user) {
      setPendingDeclined([]);
      return;
    }
    try {
      const notices = await fetchPendingDeclinedNotices();
      if (notices.length === 0) {
        setPendingDeclined([]);
        return;
      }
      const ids = [...new Set(notices.map((n) => n.actorId))];
      const { byId, founderMap, boostSet } = await fetchProfileBundle(ids);

      const list: PendingDeclinedCard[] = [];
      for (const notice of notices) {
        if (
          isDeclinedHandled(user.id, notice.notificationId, notice.actorId)
        ) {
          continue;
        }
        const profile = byId.get(notice.actorId);
        if (!profile) continue;
        list.push({
          notificationId: notice.notificationId,
          declinedAt: notice.createdAt,
          origin: notice.origin,
          profile,
          age: ageFromBirthDate(profile.birth_date),
          is_founder: founderMap.has(profile.id),
          founder_number: founderMap.get(profile.id) ?? null,
          is_boosted: boostSet.has(profile.id),
        });
      }
      // Plus récents en premier (haut/gauche), quel que soit l'étage
      list.sort(
        (a, b) => Date.parse(b.declinedAt) - Date.parse(a.declinedAt)
      );
      setPendingDeclined(list);
      setOpenPendingDeclined((open) => {
        if (!open) return open;
        return (
          list.find((c) => c.notificationId === open.notificationId) ?? null
        );
      });
    } catch {
      setPendingDeclined([]);
    }
  }, [user]);

  const loadWaitArchives = useCallback(async () => {
    if (!user) {
      setWaitArchives([]);
      return;
    }
    const gen = ++waitArchivesLoadGen.current;
    try {
      const { byId, founderMap, boostSet } = await fetchProfileBundle(
        [...new Set(listAllWaitArchives(user.id).map((r) => r.actorId))]
      );
      if (gen !== waitArchivesLoadGen.current) return;
      const latest = listAllWaitArchives(user.id);
      const missing = [
        ...new Set(
          latest.map((r) => r.actorId).filter((id) => !byId.has(id))
        ),
      ];
      if (missing.length > 0) {
        const extra = await fetchProfileBundle(missing);
        if (gen !== waitArchivesLoadGen.current) return;
        for (const [id, profile] of extra.byId) byId.set(id, profile);
        for (const [id, n] of extra.founderMap) founderMap.set(id, n);
        for (const id of extra.boostSet) boostSet.add(id);
      }
      const list: WaitArchiveCard[] = [];
      for (const row of listAllWaitArchives(user.id)) {
        const profile = byId.get(row.actorId);
        if (!profile) continue;
        list.push({
          archiveId: `${row.source}-${row.actorId}`,
          archivedAt: row.archivedAt,
          receivedAt: row.receivedAt,
          origin: row.origin,
          profile,
          age: ageFromBirthDate(profile.birth_date),
          is_founder: founderMap.has(profile.id),
          founder_number: founderMap.get(profile.id) ?? null,
          is_boosted: boostSet.has(profile.id),
          source: row.source,
          notificationId: row.notificationId,
        });
      }
      setWaitArchives(list);
      setOpenWaitArchive((open) => {
        if (!open) return open;
        const next = list.find((c) => c.archiveId === open.archiveId);
        return next ?? open;
      });
    } catch {
      if (gen !== waitArchivesLoadGen.current) return;
      setWaitArchives([]);
    }
  }, [user]);

  const loadPendingWaiting = useCallback(async () => {
    if (!user) {
      setPendingWaiting([]);
      return;
    }
    try {
      const notices = await fetchPendingWaitingNotices();
      if (notices.length === 0) {
        setPendingWaiting([]);
        return;
      }
      const { byId, founderMap, boostSet } = await fetchProfileBundle(
        [...new Set(notices.map((n) => n.actorId))]
      );
      const list: PendingWaitingCard[] = [];
      for (const notice of notices) {
        const profile = byId.get(notice.actorId);
        if (!profile) continue;
        list.push({
          notificationId: notice.notificationId,
          receivedAt: notice.createdAt,
          origin: notice.origin,
          profile,
          age: ageFromBirthDate(profile.birth_date),
          is_founder: founderMap.has(profile.id),
          founder_number: founderMap.get(profile.id) ?? null,
          is_boosted: boostSet.has(profile.id),
        });
      }
      setPendingWaiting(list);
      setOpenPendingWaiting((open) => {
        if (!open) return open;
        return (
          list.find((c) => c.notificationId === open.notificationId) ?? null
        );
      });
    } catch {
      setPendingWaiting([]);
    }
  }, [user]);

  const loadBrokenMatches = useCallback(async () => {
    if (!user) {
      setBrokenMatches([]);
      return;
    }
    try {
      const rows = await fetchMatchBreaks();
      if (rows.length === 0) {
        setBrokenMatches([]);
        setOpenBroken(null);
        return;
      }
      const { byId, founderMap, boostSet } = await fetchProfileBundle(
        [...new Set(rows.map((r) => r.peer_id))]
      );
      const list: BrokenMatchCard[] = [];
      for (const row of rows) {
        const profile = byId.get(row.peer_id);
        if (!profile) continue;
        list.push({
          archiveId: row.id,
          createdAt: row.created_at,
          origin: row.origin,
          action: row.action,
          profile,
          age: ageFromBirthDate(profile.birth_date),
          is_founder: founderMap.has(profile.id),
          founder_number: founderMap.get(profile.id) ?? null,
          is_boosted: boostSet.has(profile.id),
        });
      }
      // Plus récents en premier (haut/gauche), quel que soit l'étage
      list.sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
      );
      setBrokenMatches(list);
      setOpenBroken((open) => {
        if (!open) return open;
        return list.find((c) => c.archiveId === open.archiveId) ?? null;
      });
    } catch (err) {
      setError(userErrorMessage(err, 'Impossible de charger les matchs rompus.'));
      setBrokenMatches([]);
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      await Promise.all([
        loadMatches(),
        loadDeclinedArchives(),
        loadPendingDeclined(),
        loadWaitArchives(),
        loadPendingWaiting(),
        loadBrokenMatches(),
      ]);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [
    loadMatches,
    loadDeclinedArchives,
    loadPendingDeclined,
    loadWaitArchives,
    loadPendingWaiting,
    loadBrokenMatches,
  ]);

  const inboxLoadedRef = useRef(false);
  useEffect(() => {
    if (!pageActive) return;
    if (!inboxLoadedRef.current) {
      inboxLoadedRef.current = true;
      return;
    }
    void loadMatches();
    void loadDeclinedArchives();
    void loadPendingDeclined();
    void loadWaitArchives();
    void loadPendingWaiting();
    void loadBrokenMatches();
  }, [
    pageActive,
    loadMatches,
    loadDeclinedArchives,
    loadPendingDeclined,
    loadWaitArchives,
    loadPendingWaiting,
    loadBrokenMatches,
  ]);

  const inboxReloadTimer = useRef<number | null>(null);
  useInboxReload((detail) => {
    const decision = detail?.decision;
    if (
      decision === 'wait' ||
      decision === 'wait-dismiss' ||
      decision === 'reset'
    ) {
      return;
    }
    if (inboxReloadTimer.current != null) {
      window.clearTimeout(inboxReloadTimer.current);
    }
    inboxReloadTimer.current = window.setTimeout(() => {
      inboxReloadTimer.current = null;
      void loadMatches();
      void loadDeclinedArchives();
      void loadPendingDeclined();
      void loadWaitArchives();
      void loadPendingWaiting();
      void loadBrokenMatches();
      void unread.refresh();
    }, 180);
  });

  useEffect(() => {
    return () => {
      if (inboxReloadTimer.current != null) {
        window.clearTimeout(inboxReloadTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!focusKey) return;
    const resolvedCategory: MatchPulseCategory | null =
      focusPulseCategory ?? (focusPulsePendingAll ? 'new' : null);
    if (
      !focusActorId &&
      !focusHintName &&
      !resolvedCategory &&
      !focusHighlight &&
      !focusDeclined &&
      !focusWaitingIncoming
    ) {
      return;
    }
    pendingFocusRef.current = {
      actorId: focusActorId || '',
      openChat: focusOpenChat,
      highlight: focusHighlight,
      hintName: focusHintName,
      pulseCategory: resolvedCategory,
      declined: focusDeclined,
      waitingIncoming: focusWaitingIncoming,
    };
  }, [
    focusActorId,
    focusOpenChat,
    focusHighlight,
    focusHintName,
    focusPulseCategory,
    focusPulsePendingAll,
    focusDeclined,
    focusWaitingIncoming,
    focusKey,
  ]);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending || loading) return;

    if (pending.declined) {
      const needle = (pending.hintName || '').trim().toLowerCase();
      const pendingCard =
        pendingDeclined.find((c) => c.profile.id === pending.actorId) ||
        (needle
          ? pendingDeclined.find(
              (c) =>
                c.profile.display_name.trim().toLowerCase() === needle ||
                c.profile.display_name.trim().toLowerCase().includes(needle)
            )
          : undefined);
      const archivedCard =
        declinedArchives.find((c) => c.profile.id === pending.actorId) ||
        (needle
          ? declinedArchives.find(
              (c) =>
                c.profile.display_name.trim().toLowerCase() === needle ||
                c.profile.display_name.trim().toLowerCase().includes(needle)
            )
          : undefined);
      const card = pendingCard || archivedCard;
      if (!card) {
        if (loading) return;
        if (!pending.attempts) {
          pending.attempts = 1;
          void loadPendingDeclined();
          void loadDeclinedArchives();
          return;
        }
        pendingFocusRef.current = null;
        onFocusActorConsumed?.();
        return;
      }
      pendingFocusRef.current = null;
      onFocusActorConsumed?.();
      setChatPeer(null);
      setOpenPendingDeclined(null);
      setOpenArchive(null);
      setOpenProfile(null);
      setOpenPendingWaiting(null);
      setOpenWaitArchive(null);
      setPulseCategory(null);
      setPulseSingleId(null);
      setDeclinedActionHintId(null);
      const profileId = card.profile.id;
      const elId =
        'notificationId' in card
          ? `match-card-declined-${card.notificationId}`
          : `match-card-archive-${card.archiveId}`;
      window.setTimeout(() => {
        setPulseSingleId(profileId);
        setDeclinedActionHintId(profileId);
      }, 0);
      scrollMatchCardIntoView(elId);
      return;
    }

    const needle = (pending.hintName || '').trim().toLowerCase();
    const findByHint = <
      T extends { profile: { id: string; display_name: string } },
    >(
      list: T[]
    ) =>
      list.find((c) => c.profile.id === pending.actorId) ||
      (needle
        ? list.find(
            (c) =>
              c.profile.display_name.trim().toLowerCase() === needle ||
              c.profile.display_name.trim().toLowerCase().includes(needle)
          )
        : undefined);

    if (pending.waitingIncoming) {
      const pendingCard = findByHint(pendingWaiting);
      const archivedCard = findByHint(waitArchives);
      const card = pendingCard || archivedCard;
      pendingFocusRef.current = null;
      onFocusActorConsumed?.();
      if (!card) return;
      setPulseCategory(null);
      setPulseSingleId(card.profile.id);
      const elId = pendingCard
        ? `match-card-wait-pending-${pendingCard.notificationId}`
        : `match-card-wait-archive-${archivedCard?.archiveId ?? ''}`;
      scrollMatchCardIntoView(elId);
      if (pendingCard) setOpenPendingWaiting(pendingCard);
      else setOpenWaitArchive(archivedCard!);
      return;
    }

    if (pending.highlight) {
      const archivedMine = findByHint(
        waitArchives.filter((c) => c.source === 'mine')
      );
      if (archivedMine) {
        pendingFocusRef.current = null;
        onFocusActorConsumed?.();
        setPulseCategory(null);
        setPulseSingleId(archivedMine.profile.id);
        scrollMatchCardIntoView(
          `match-card-wait-archive-${archivedMine.archiveId}`
        );
        setOpenWaitArchive(archivedMine);
        return;
      }
    }

    if (pending.pulseCategory && !pending.highlight) {
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
            : pending.pulseCategory === 'first'
              ? matches.find((m) => {
                  const isPending = m.kind !== 'match';
                  const isMatched = !isPending || m.alreadyLiked;
                  const hasDialogue =
                    peersWithChat.has(m.profile.id) ||
                    (unread.bySender[m.profile.id] || 0) > 0;
                  return isMatched && !m.waiting && !hasDialogue;
                })
              : matches.find(
                  (m) =>
                    m.kind !== 'match' && !m.alreadyLiked && !m.waiting
                );
        if (target) {
          scrollMatchCardIntoView(`match-card-${target.profile.id}`);
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
        const hint = pending.hintName.toLowerCase();
        found =
          waitingList.find(
            (m) => m.profile.display_name.trim().toLowerCase() === hint
          ) ||
          waitingList.find((m) =>
            m.profile.display_name.trim().toLowerCase().includes(hint)
          ) ||
          matches.find(
            (m) =>
              isActionablePending(m) &&
              m.profile.display_name.trim().toLowerCase() === hint
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
      setPulseCategory(null);
      setPulseSingleId(found.profile.id);
      scrollMatchCardIntoView(`match-card-${found.profile.id}`);
      setOpenProfile(found);
      return;
    }

    setPulseCategory(null);
    setPulseSingleId(found.profile.id);
    scrollMatchCardIntoView(`match-card-${found.profile.id}`);
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
    peersWithChat,
    unread.bySender,
    pendingDeclined,
    declinedArchives,
    pendingWaiting,
    waitArchives,
    loadPendingDeclined,
    loadDeclinedArchives,
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
        forgetClearedWait(user.id, item.profile.id);
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
        forgetClearedWait(user.id, item.profile.id);
        await respondToInboxInterest(item.profile.id, decision, item.origin);
        if (decision === 'refuse') {
          forgetWaitArchive(user.id, item.profile.id);
          setWaitArchives((prev) =>
            prev.filter((c) => c.profile.id !== item.profile.id)
          );
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
      } catch (err) {
        setError(userErrorMessage(err, 'Impossible d’enregistrer ta réponse'));
      } finally {
        setActingId(null);
      }
    },
    [user, actingId, likesExhausted, handleMatchBack, markResolved]
  );

  const handleRefuseWaiting = useCallback(
    async (item: Match) => {
      if (!user || actingId) return;
      if (item.kind === 'match' || item.alreadyLiked) return;

      const refused: Match = {
        ...item,
        waiting: false,
        refused: true,
      };
      setOpenWaitingManage(refused);
      setOpenProfile(null);
      setError(null);
      matchesLoadGen.current += 1;
      forgetClearedWait(user.id, item.profile.id);
      restoredWaitActorsRef.current.delete(item.profile.id);
      try {
        await respondToInboxInterest(item.profile.id, 'refuse', item.origin);
        forgetWaitArchive(user.id, item.profile.id);
        setWaitArchives((prev) =>
          prev.filter((c) => c.profile.id !== item.profile.id)
        );
        setMatches((prev) =>
          prev.filter((m) => m.profile.id !== item.profile.id)
        );
        markResolved(item.profile.id, 'refused');
        setPulseCategory(null);
        setPulseSingleId((id) => (id === item.profile.id ? null : id));
      } catch (err) {
        setOpenWaitingManage(null);
        setError(userErrorMessage(err, 'Impossible d’enregistrer ta réponse'));
      }
    },
    [user, actingId, markResolved]
  );

  const handlePendingDeclined = useCallback(
    async (card: PendingDeclinedCard, archive: boolean) => {
      if (declinedBusyRef.current) return;
      declinedBusyRef.current = true;
      consumeAttentionPulse(card.profile.id);
      setDeclinedBusyId(card.notificationId);
      setError(null);
      if (user?.id) {
        rememberDeclinedHandled(user.id, {
          notificationId: card.notificationId,
          actorId: card.profile.id,
          archive,
          origin: card.origin,
          declinedAt: card.declinedAt,
        });
      }
      setOpenPendingDeclined(null);
      setPendingDeclined((prev) =>
        prev.filter(
          (c) =>
            c.notificationId !== card.notificationId &&
            c.profile.id !== card.profile.id
        )
      );
      const tempArchiveId = `tmp-${card.notificationId}`;
      if (archive) {
        setDeclinedArchives((prev) => [
          {
            archiveId: tempArchiveId,
            archivedAt: new Date().toISOString(),
            declinedAt: card.declinedAt,
            origin: card.origin,
            profile: card.profile,
            age: card.age,
            is_founder: card.is_founder,
            founder_number: card.founder_number,
            is_boosted: card.is_boosted,
            source: 'theirs' as const,
          },
          ...prev.filter((c) => c.profile.id !== card.profile.id),
        ]);
      }
      try {
        await dismissDeclinedNotification(
          card.notificationId,
          archive,
          card.origin,
          card.profile.id,
          card.declinedAt
        );
        if (archive) await loadDeclinedArchives();
      } catch (err) {
        setError(
          userErrorMessage(
            err,
            archive
              ? 'Impossible d’archiver ce profil.'
              : 'Impossible de supprimer cette notification.'
          )
        );
        if (archive) await loadDeclinedArchives();
      } finally {
        declinedBusyRef.current = false;
        setDeclinedBusyId(null);
      }
    },
    [user, loadDeclinedArchives, consumeAttentionPulse]
  );

  const handleArchiveWaiting = useCallback(
    (item: Match) => {
      if (!user) return;
      if (item.kind === 'match' || item.alreadyLiked) return;
      const actorId = item.profile.id;
      if (waitCycleLockRef.current.has(actorId)) return;
      waitCycleLockRef.current.add(actorId);
      waitArchivesLoadGen.current += 1;
      matchesLoadGen.current += 1;
      restoredWaitActorsRef.current.delete(actorId);
      rememberMineWaitArchive(user.id, {
        actorId,
        origin: item.origin,
        receivedAt: item.date_received,
      });
      setError(null);
      setOpenProfile(null);
      setOpenWaitingManage(null);
      setPulseCategory(null);
      setPulseSingleId((id) => (id === actorId ? null : id));
      setWaitArchives((prev) => [
        {
          archiveId: `mine-${actorId}`,
          archivedAt: new Date().toISOString(),
          receivedAt: item.date_received,
          origin: item.origin,
          profile: item.profile,
          age: item.age,
          is_founder: item.is_founder,
          founder_number: item.founder_number,
          is_boosted: item.is_boosted,
          source: 'mine',
        },
        ...prev.filter((c) => c.profile.id !== actorId),
      ]);
      waitCycleLockRef.current.delete(actorId);
      if (item.refused) {
        void restoreWaitFromArchive(actorId, item.origin, { silent: true });
      }
      void dismissWaitingNotification({
        actorId,
        kinds: ['match_wait_reminder'],
      }).catch(() => undefined);
    },
    [user]
  );

  const handlePendingWaiting = useCallback(
    async (card: PendingWaitingCard, archive: boolean) => {
      if (!user || declinedBusyRef.current) return;
      declinedBusyRef.current = true;
      setDeclinedBusyId(card.notificationId);
      setError(null);
      setOpenPendingWaiting(null);
      setPendingWaiting((prev) =>
        prev.filter(
          (c) =>
            c.notificationId !== card.notificationId &&
            c.profile.id !== card.profile.id
        )
      );
      if (archive) {
        rememberTheirsWaitArchive(user.id, {
          actorId: card.profile.id,
          origin: card.origin,
          receivedAt: card.receivedAt,
          notificationId: card.notificationId,
        });
        setWaitArchives((prev) => [
          {
            archiveId: `theirs-${card.profile.id}`,
            archivedAt: new Date().toISOString(),
            receivedAt: card.receivedAt,
            origin: card.origin,
            profile: card.profile,
            age: card.age,
            is_founder: card.is_founder,
            founder_number: card.founder_number,
            is_boosted: card.is_boosted,
            source: 'theirs',
            notificationId: card.notificationId,
          },
          ...prev.filter((c) => c.profile.id !== card.profile.id),
        ]);
      }
      try {
        await dismissWaitingNotification({
          notificationId: card.notificationId,
          actorId: card.profile.id,
          kinds: ['match_waiting'],
        });
      } catch (err) {
        setError(
          userErrorMessage(
            err,
            archive
              ? 'Impossible d’archiver ce profil.'
              : 'Impossible de supprimer cette notification.'
          )
        );
        await loadPendingWaiting();
        await loadWaitArchives();
      } finally {
        declinedBusyRef.current = false;
        setDeclinedBusyId(null);
      }
    },
    [user, loadPendingWaiting, loadWaitArchives]
  );

  const handleDeleteWaitArchive = useCallback(
    async (card: WaitArchiveCard) => {
      if (!user || declinedBusyRef.current) return;
      declinedBusyRef.current = true;
      setDeclinedBusyId(card.archiveId);
      setError(null);
      setOpenWaitArchive((open) =>
        open?.archiveId === card.archiveId ? null : open
      );
      setWaitArchives((prev) =>
        prev.filter(
          (c) =>
            c.archiveId !== card.archiveId && c.profile.id !== card.profile.id
        )
      );
      forgetWaitArchive(user.id, card.profile.id);
      try {
        if (card.source === 'mine') {
          forgetClearedWait(user.id, card.profile.id);
          setMatches((prev) =>
            prev.filter((m) => m.profile.id !== card.profile.id)
          );
          markResolved(card.profile.id, 'refused');
          await respondToInboxInterest(
            card.profile.id,
            'refuse',
            card.origin
          );
        }
      } catch (err) {
        setError(
          userErrorMessage(err, 'Impossible de supprimer cette archive.')
        );
        await loadWaitArchives();
        await loadMatches();
      } finally {
        declinedBusyRef.current = false;
        setDeclinedBusyId(null);
      }
    },
    [user, markResolved, loadWaitArchives, loadMatches]
  );

  const handleRestoreWaitArchive = useCallback(
    (card: WaitArchiveCard) => {
      if (!user) return;
      if (card.source !== 'mine') return;
      const actorId = card.profile.id;
      if (waitCycleLockRef.current.has(actorId)) return;
      waitCycleLockRef.current.add(actorId);
      setError(null);
      setOpenWaitArchive((open) =>
        open?.archiveId === card.archiveId ? null : open
      );
      matchesLoadGen.current += 1;
      waitArchivesLoadGen.current += 1;
      restoredWaitActorsRef.current.add(actorId);
      releaseWaitCycle(user.id, actorId);
      setWaitArchives((prev) =>
        prev.filter(
          (c) =>
            c.archiveId !== card.archiveId && c.profile.id !== actorId
        )
      );
      const restoredAt = new Date().toISOString();
      setMatches((prev) => {
        const exists = prev.some((m) => m.profile.id === actorId);
        if (exists) {
          return prev.map((m) =>
            m.profile.id === actorId
              ? {
                  ...m,
                  waiting: true,
                  waitingAt: m.waitingAt || restoredAt,
                  refused: false,
                }
              : m
          );
        }
        const incoming: Match = {
          profile: card.profile,
          age: card.age,
          date_received: card.receivedAt,
          matched_at: card.receivedAt,
          kind: card.origin === 'flash' ? 'flash' : 'like',
          origin: card.origin,
          matchedBackAt: null,
          alreadyLiked: false,
          matchRole: 'accepted',
          waiting: true,
          waitingAt: restoredAt,
          refused: false,
          is_founder: card.is_founder,
          founder_number: card.founder_number,
          is_boosted: card.is_boosted,
        };
        return [incoming, ...prev];
      });
      markResolved(actorId, 'wait');
      waitCycleLockRef.current.delete(actorId);
      void restoreWaitFromArchive(actorId, card.origin, { silent: true });
    },
    [user, markResolved]
  );

  const handleDeleteArchived = useCallback(
    async (card: DeclinedArchiveCard) => {
      if (declinedBusyRef.current) return;
      declinedBusyRef.current = true;
      consumeAttentionPulse(card.profile.id);
      setDeclinedBusyId(card.archiveId);
      setError(null);
      setOpenArchive((open) =>
        open?.archiveId === card.archiveId ? null : open
      );
      setDeclinedArchives((prev) =>
        prev.filter(
          (c) =>
            c.archiveId !== card.archiveId && c.profile.id !== card.profile.id
        )
      );
      try {
        await deleteDeclinedArchive(card.archiveId, card.profile.id);
      } catch (err) {
        setError(
          userErrorMessage(err, 'Impossible de supprimer cette archive.')
        );
      } finally {
        declinedBusyRef.current = false;
        setDeclinedBusyId(null);
      }
    },
    [consumeAttentionPulse]
  );

  const handleBrokenRestore = useCallback(
    async (card: BrokenMatchCard) => {
      if (brokenBusyId) return;
      setBrokenBusyId(card.archiveId);
      setError(null);
      try {
        await restoreBrokenMatch(card.profile.id);
        restoredChatPeersRef.current.add(card.profile.id);
        setOpenBroken(null);
        setBrokenMatches((prev) =>
          prev.filter((c) => c.archiveId !== card.archiveId)
        );
        await Promise.all([loadMatches(), loadBrokenMatches()]);
        setPeersWithChat((prev) => {
          const next = new Set(prev);
          next.add(card.profile.id);
          return next;
        });
      } catch (err) {
        setError(userErrorMessage(err, 'Impossible de rétablir ce match.'));
        await loadBrokenMatches();
      } finally {
        setBrokenBusyId(null);
      }
    },
    [brokenBusyId, loadMatches, loadBrokenMatches]
  );

  const handleBrokenPurge = useCallback(
    async (card: BrokenMatchCard) => {
      if (brokenBusyId) return;
      setBrokenBusyId(card.archiveId);
      setError(null);
      try {
        await purgeBrokenMatch(card.profile.id);
        restoredChatPeersRef.current.delete(card.profile.id);
        setOpenBroken(null);
        setBrokenMatches((prev) =>
          prev.filter((c) => c.archiveId !== card.archiveId)
        );
        setPeersWithChat((prev) => {
          if (!prev.has(card.profile.id)) return prev;
          const next = new Set(prev);
          next.delete(card.profile.id);
          return next;
        });
      } catch (err) {
        setError(
          userErrorMessage(err, 'Impossible de supprimer définitivement ce lien.')
        );
        await loadBrokenMatches();
      } finally {
        setBrokenBusyId(null);
      }
    },
    [brokenBusyId, loadBrokenMatches]
  );

  const brokenPeerIds = useMemo(
    () => new Set(brokenMatches.map((c) => c.profile.id)),
    [brokenMatches]
  );

  const floors = useMemo(() => {
    const buckets: Record<MatchFloor, Match[]> = {
      new: [],
      wait: [],
      'matched-quiet': [],
      'matched-chat': [],
    };
    for (const match of matches) {
      if (brokenPeerIds.has(match.profile.id)) continue;
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
      new: buckets.new.sort(sortByDateReceivedDesc),
      wait: buckets.wait
        .filter(
          (m) => !user || !isMineWaitArchived(user.id, m.profile.id)
        )
        .sort(sortByDateReceivedDesc),
      matchedQuiet: buckets['matched-quiet'].sort(sortByDateReceivedDesc),
      matchedChat: buckets['matched-chat'].sort(sortByDateReceivedDesc),
    };
  }, [
    matches,
    peersWithChat,
    unread.bySender,
    user,
    waitArchives,
    brokenPeerIds,
  ]);

  const visibleWaitArchives = useMemo(() => {
    const matchedIds = new Set(
      matches
        .filter((m) => m.kind === 'match' || m.alreadyLiked)
        .map((m) => m.profile.id)
    );
    return waitArchives
      .filter((card) => !matchedIds.has(card.profile.id))
      .sort(
        (a, b) => Date.parse(b.archivedAt) - Date.parse(a.archivedAt)
      );
  }, [waitArchives, matches]);

  /** Source de vérité pour la cloche : états des cartes Mes Matchs. */
  useEffect(() => {
    const next: MatchesInboxEntry[] = matches
      .filter((match) => !brokenPeerIds.has(match.profile.id))
      .map((match) => {
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
  }, [matches, peersWithChat, unread.bySender, publish, brokenPeerIds]);

  const renderMatchCard = (match: Match) => {
    const isPending = match.kind !== 'match';
    const isFlash = match.origin === 'flash';
    const isMatched = !isPending || match.alreadyLiked;
    const unreadCount = unread.bySender[match.profile.id] || 0;
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
    const isQuietMatch = isMatched && !hasDialogue && !match.waiting;
    const shouldPulse = match.waiting
      ? pulseCategory === 'wait' || pulseSingleId === match.profile.id
      : isToStudy &&
        (pulseCategory === 'new' || pulseSingleId === match.profile.id)
        ? true
        : isQuietMatch &&
          (pulseCategory === 'first' || pulseSingleId === match.profile.id);

    const cardTone = (() => {
      if (match.waiting) {
        return shouldPulse
          ? 'match-card-wait match-card-attention-pulse'
          : 'match-card-wait';
      }
      if (isMatched) {
        if (hasDialogue) return 'match-card-matched-chat';
        return shouldPulse
          ? 'match-card-matched-quiet match-card-attention-pulse'
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
          className="match-card-photo relative w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-rose-100 to-amber-100 flex-shrink-0"
          aria-label={`Voir le profil de ${match.profile.display_name}`}
        >
          {match.profile.photo_url ? (
            <ProfilePhoto
              src={match.profile.photo_url}
              width={112}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-rose-400">
              {match.profile.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <OnlinePresenceDot online={match.profile.is_online} size="avatar" />
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
          <CardIdentity
            name={match.profile.display_name}
            age={match.age}
            isBoosted={match.is_boosted}
            isFounder={match.is_founder}
            founderNumber={match.founder_number}
          />
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

        {isPending && !match.alreadyLiked ? (
          <div className={CARD_ACTIONS_COL}>
            <MatcherButton
              name={match.profile.display_name}
              busy={actingId === match.profile.id}
              disabled={likesExhausted}
              matched={match.alreadyLiked}
              tooltip={cardActionTooltip(0, isToStudy ? 3 : 2)}
              onClick={() => void handleMatchBack(match)}
            />
            {isToStudy ? (
              <WaitButton
                name={match.profile.display_name}
                busy={actingId === match.profile.id}
                tooltip={cardActionTooltip(1, 3)}
                onClick={() => void handleInboxDecision(match, 'wait')}
              />
            ) : null}
            <RefuseButton
              name={match.profile.display_name}
              busy={actingId === match.profile.id}
              tooltip={cardActionTooltip(isToStudy ? 2 : 1, isToStudy ? 3 : 2)}
              variant={match.waiting ? 'ban' : 'trash'}
              label={match.waiting ? 'Refuser' : 'Supprimer'}
              onClick={() => {
                if (match.waiting) {
                  void handleRefuseWaiting(match);
                  return;
                }
                void handleInboxDecision(match, 'refuse');
              }}
            />
          </div>
        ) : (
          <ChatBubbleButton
            name={match.profile.display_name}
            unreadCount={unreadCount}
            onClick={() => setChatPeer(match.profile)}
          />
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

  const renderWaitArchiveCard = (card: WaitArchiveCard) => {
    const isFlash = card.origin === 'flash';
    const theirs = card.source === 'theirs';
    return (
      <div
        id={`match-card-wait-archive-${card.archiveId}`}
        key={card.archiveId}
        data-match-state="wait-archive"
        className={`rounded-2xl p-4 flex items-center gap-3 transition-shadow animate-fadeIn ${
          theirs ? 'match-card-wait-theirs' : 'match-card-wait-archive'
        }${
          pulseSingleId === card.profile.id ? ' match-card-attention-pulse' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => {
            consumeAttentionPulse(card.profile.id);
            setOpenWaitArchive(card);
          }}
          className={`match-card-photo relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0 ${
            theirs
              ? 'bg-gradient-to-br from-amber-50 to-yellow-50'
              : 'bg-gradient-to-br from-amber-100 to-yellow-100'
          }`}
          aria-label={`Voir le profil de ${card.profile.display_name}`}
        >
          {card.profile.photo_url ? (
            <ProfilePhoto
              src={card.profile.photo_url}
              width={112}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className={`w-full h-full flex items-center justify-center text-lg font-bold ${
                theirs ? 'text-amber-600/50' : 'text-amber-700/70'
              }`}
            >
              {card.profile.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <OnlinePresenceDot online={card.profile.is_online} size="avatar" />
          {isFlash ? (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-amber-400 text-white flex items-center justify-center shadow-sm">
              <Zap className="w-3 h-3" fill="currentColor" aria-hidden />
            </span>
          ) : (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-sm">
              <Heart className="w-3 h-3" fill="currentColor" aria-hidden />
            </span>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <CardIdentity
            name={card.profile.display_name}
            age={card.age}
            isBoosted={card.is_boosted}
            isFounder={card.is_founder}
            founderNumber={card.founder_number}
            nameClass={theirs ? 'text-amber-950/90' : 'text-amber-950'}
            ageClass={theirs ? 'text-amber-900/50' : 'text-amber-900/60'}
          />
          {card.profile.location && (
            <p
              className={`text-xs flex items-center gap-1 mt-0.5 ${
                theirs ? 'text-amber-900/55' : 'text-amber-900/70'
              }`}
            >
              <MapPin className="w-3 h-3" />
              {card.profile.location}
            </p>
          )}
          <p
            className={`text-xs mt-1 ${
              theirs ? 'text-amber-950/70' : 'text-amber-950/80'
            }`}
          >
            {waitArchiveStatusLabel(
              card.origin,
              card.archivedAt,
              card.source
            )}
          </p>
        </div>

        <div className={CARD_ACTIONS_COL}>
          {card.source === 'mine' ? (
            <RestoreLinkButton
              name={card.profile.display_name}
              busy={declinedBusyId === card.archiveId}
              tooltip={cardActionTooltip(0, 2)}
              onClick={() => void handleRestoreWaitArchive(card)}
            />
          ) : null}
          <RefuseButton
            name={card.profile.display_name}
            busy={declinedBusyId === card.archiveId}
            variant="trash"
            label="Supprimer"
            tooltip={cardActionTooltip(
              card.source === 'mine' ? 1 : 0,
              card.source === 'mine' ? 2 : 1
            )}
            onClick={() => void handleDeleteWaitArchive(card)}
          />
        </div>
      </div>
    );
  };

  const renderWaitFloor = () => {
    const mineActive = floors.wait;
    const mineArchived = visibleWaitArchives.filter((c) => c.source === 'mine');
    const theirsArchived = visibleWaitArchives.filter(
      (c) => c.source === 'theirs'
    );
    if (
      mineActive.length === 0 &&
      mineArchived.length === 0 &&
      theirsArchived.length === 0
    ) {
      return null;
    }
    return (
      <section className="space-y-6" aria-label="Mis en attente">
        {mineActive.length > 0 ? (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 tracking-wide">
              <ColorChip label="Mis en attente par toi" tone="wait" />
              <span className="text-gray-400 font-normal">
                ({mineActive.length})
              </span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {mineActive.map((m) => renderMatchCard(m))}
            </div>
          </div>
        ) : null}
        {mineArchived.length > 0 ? (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 tracking-wide">
              <span className="match-intro-chip match-chip-wait-archive">
                Mis en attente par toi - archive
              </span>
              <span className="text-gray-400 font-normal">
                ({mineArchived.length})
              </span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {mineArchived.map((card) => renderWaitArchiveCard(card))}
            </div>
          </div>
        ) : null}
        {theirsArchived.length > 0 ? (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 tracking-wide">
              <span className="match-intro-chip match-chip-wait-theirs">
                Mis en attente par l&apos;autre
              </span>
              <span className="text-gray-400 font-normal">
                ({theirsArchived.length})
              </span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {theirsArchived.map((card) => renderWaitArchiveCard(card))}
            </div>
          </div>
        ) : null}
      </section>
    );
  };

  const renderPendingDeclinedCard = (card: PendingDeclinedCard) => {
    const isFlash = card.origin === 'flash';
    const busy = declinedBusyId === card.notificationId;
    const showHint = declinedActionHintId === card.profile.id;
    return (
      <div
        className={`relative${showHint ? ' z-20' : ''}`}
        key={card.notificationId}
      >
        {showHint && (
          <DeclinedActionHint
            onClose={() => consumeAttentionPulse(card.profile.id)}
          />
        )}
      <div
        id={`match-card-declined-${card.notificationId}`}
        data-match-state="declined-pending"
        className={`rounded-2xl p-4 flex items-center gap-3 transition-shadow animate-fadeIn match-card-declined${
          pulseSingleId === card.profile.id ? ' match-card-attention-pulse' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => {
            consumeAttentionPulse(card.profile.id);
            setOpenPendingDeclined(card);
          }}
          className="match-card-photo relative w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-purple-100 to-fuchsia-100 flex-shrink-0"
          aria-label={`Voir le profil de ${card.profile.display_name}`}
        >
          {card.profile.photo_url ? (
            <ProfilePhoto
              src={card.profile.photo_url}
              width={112}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-purple-400">
              {card.profile.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <OnlinePresenceDot online={card.profile.is_online} size="avatar" />
          {isFlash ? (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-amber-400 text-white flex items-center justify-center shadow-sm">
              <Zap className="w-3 h-3" fill="currentColor" aria-hidden />
            </span>
          ) : (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-sm">
              <Heart className="w-3 h-3" fill="currentColor" aria-hidden />
            </span>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <CardIdentity
            name={card.profile.display_name}
            age={card.age}
            isBoosted={card.is_boosted}
            isFounder={card.is_founder}
            founderNumber={card.founder_number}
            nameClass="text-purple-950"
            ageClass="text-purple-800/60"
          />
          {card.profile.location && (
            <p className="text-xs text-purple-900/60 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" />
              {card.profile.location}
            </p>
          )}
          <p className="text-xs text-purple-900/80 mt-1">
            {declinedArchiveStatusLabel(card.origin, card.declinedAt)}
          </p>
        </div>

        <div className={CARD_ACTIONS_COL}>
          <ArchiveButton
            name={card.profile.display_name}
            busy={busy}
            tooltip={cardActionTooltip(0, 2)}
            onClick={() => void handlePendingDeclined(card, true)}
          />
          <RefuseButton
            name={card.profile.display_name}
            busy={busy}
            label="Supprimer"
            tooltip={cardActionTooltip(1, 2)}
            onClick={() => void handlePendingDeclined(card, false)}
          />
        </div>
      </div>
      </div>
    );
  };

  const renderPendingDeclinedFloor = () => {
    if (pendingDeclined.length === 0) return null;
    return (
      <section className="space-y-2" aria-label="Pas cette fois">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 tracking-wide">
          <span className="match-intro-chip match-chip-declined">
            Pas cette fois
          </span>
          <span className="text-gray-400 font-normal">
            ({pendingDeclined.length})
          </span>
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {pendingDeclined.map((card) => renderPendingDeclinedCard(card))}
        </div>
      </section>
    );
  };

  const renderDeclinedArchiveCard = (card: DeclinedArchiveCard) => {
    const isFlash = card.origin === 'flash';
    const showHint = declinedActionHintId === card.profile.id;
    return (
      <div
        className={`relative${showHint ? ' z-20' : ''}`}
        key={card.archiveId}
      >
        {showHint && (
          <DeclinedActionHint
            onClose={() => consumeAttentionPulse(card.profile.id)}
          />
        )}
      <div
        id={`match-card-archive-${card.archiveId}`}
        data-match-state="declined-archive"
        className={`rounded-2xl p-4 flex items-center gap-3 transition-shadow animate-fadeIn match-card-declined-archive${
          pulseSingleId === card.profile.id ? ' match-card-attention-pulse' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => {
            consumeAttentionPulse(card.profile.id);
            setOpenArchive(card);
          }}
          className="match-card-photo relative w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-purple-100 to-fuchsia-100 flex-shrink-0"
          aria-label={`Voir le profil de ${card.profile.display_name}`}
        >
          {card.profile.photo_url ? (
            <ProfilePhoto
              src={card.profile.photo_url}
              width={112}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-purple-400">
              {card.profile.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <OnlinePresenceDot online={card.profile.is_online} size="avatar" />
          {isFlash ? (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-amber-400 text-white flex items-center justify-center shadow-sm">
              <Zap className="w-3 h-3" fill="currentColor" aria-hidden />
            </span>
          ) : (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-sm">
              <Heart className="w-3 h-3" fill="currentColor" aria-hidden />
            </span>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <CardIdentity
            name={card.profile.display_name}
            age={card.age}
            isBoosted={card.is_boosted}
            isFounder={card.is_founder}
            founderNumber={card.founder_number}
            nameClass="text-purple-950"
            ageClass="text-purple-800/60"
          />
          {card.profile.location && (
            <p className="text-xs text-purple-900/60 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" />
              {card.profile.location}
            </p>
          )}
          <p className="text-xs text-purple-900/80 mt-1">
            {declinedArchiveStatusLabel(
              card.origin,
              card.declinedAt,
              card.source
            )}
          </p>
        </div>

        <div className={CARD_ACTIONS_COL}>
          <RefuseButton
            name={card.profile.display_name}
            busy={declinedBusyId === card.archiveId}
            label="Supprimer"
            tooltip={cardActionTooltip(0, 1)}
            onClick={() => void handleDeleteArchived(card)}
          />
        </div>
      </div>
      </div>
    );
  };

  const renderDeclinedArchiveFloor = () => {
    if (declinedArchives.length === 0) return null;
    return (
      <section className="space-y-2" aria-label="Pas cette fois — archives">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 tracking-wide">
          <span className="match-intro-chip match-chip-declined-archive">
            Pas cette fois — archives
          </span>
          <span className="text-gray-400 font-normal">
            ({declinedArchives.length})
          </span>
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {declinedArchives.map((card) => renderDeclinedArchiveCard(card))}
        </div>
      </section>
    );
  };

  const renderBrokenCard = (card: BrokenMatchCard) => {
    const isFlash = card.origin === 'flash';
    const busy = brokenBusyId === card.archiveId;
    const hadDialogue = peersWithChat.has(card.profile.id);
    return (
      <div
        id={`match-card-broken-${card.archiveId}`}
        key={card.archiveId}
        data-match-state="broken"
        className={`rounded-2xl p-4 flex items-center gap-3 transition-shadow animate-fadeIn ${
          hadDialogue ? 'match-card-broken-chat' : 'match-card-broken-quiet'
        }`}
      >
        <button
          type="button"
          onClick={() => setOpenBroken(card)}
          className="match-card-photo relative w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 flex-shrink-0"
          aria-label={`Gérer le match rompu avec ${card.profile.display_name}`}
        >
          {card.profile.photo_url ? (
            <ProfilePhoto
              src={card.profile.photo_url}
              width={112}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-slate-400">
              {card.profile.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <OnlinePresenceDot online={card.profile.is_online} size="avatar" />
          {isFlash ? (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-amber-400 text-white flex items-center justify-center shadow-sm">
              <Zap className="w-3 h-3" fill="currentColor" aria-hidden />
            </span>
          ) : (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-sm">
              <Heart className="w-3 h-3" fill="currentColor" aria-hidden />
            </span>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <CardIdentity
            name={card.profile.display_name}
            age={card.age}
            isBoosted={card.is_boosted}
            isFounder={card.is_founder}
            founderNumber={card.founder_number}
            nameClass="text-slate-800"
            ageClass="text-slate-500"
          />
          {card.profile.location && (
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" />
              {card.profile.location}
            </p>
          )}
          <p className="text-xs text-slate-600 mt-1">
            {brokenMatchStatusLabel(card.action, card.createdAt)}
          </p>
          <p
            className={`match-broken-origin-badge text-xs ${
              hadDialogue
                ? 'match-broken-origin-badge-chat text-gray-600'
                : 'match-broken-origin-badge-quiet text-emerald-800'
            }`}
          >
            {brokenMatchOriginLabel(hadDialogue)}
          </p>
        </div>
        <div className={CARD_ACTIONS_COL}>
          <RestoreLinkButton
            name={card.profile.display_name}
            busy={busy}
            tooltip={cardActionTooltip(0, 2)}
            onClick={() => void handleBrokenRestore(card)}
          />
          <RefuseButton
            name={card.profile.display_name}
            busy={busy}
            label="Supprimer"
            tooltip={cardActionTooltip(1, 2)}
            onClick={() => void handleBrokenPurge(card)}
          />
        </div>
      </div>
    );
  };

  const renderBrokenFloor = () => {
    if (brokenMatches.length === 0) return null;
    return (
      <section className="space-y-2" aria-label="Matchs rompus">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 tracking-wide">
          <span className="match-intro-chip match-chip-broken">
            Matchs rompus
          </span>
          <span className="text-gray-400 font-normal">
            ({brokenMatches.length})
          </span>
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {brokenMatches.map((card) => renderBrokenCard(card))}
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

  if (error && matches.length === 0 && declinedArchives.length === 0 && pendingDeclined.length === 0 && waitArchives.length === 0 && pendingWaiting.length === 0 && brokenMatches.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 text-red-700 text-sm max-w-md">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (matches.length === 0 && declinedArchives.length === 0 && pendingDeclined.length === 0 && waitArchives.length === 0 && pendingWaiting.length === 0 && brokenMatches.length === 0) {
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
          onMatchHidden={() => {
            setChatPeer(null);
            void loadMatches();
            void loadBrokenMatches();
            void unread.refresh();
            onChatClosed?.();
          }}
        />
      )}

      <h2 className="text-xl font-bold text-gray-900 mb-1">
        Mes Matchs (
        {matches.filter((m) => !brokenPeerIds.has(m.profile.id)).length})
      </h2>
      <div className="match-intro text-sm text-gray-600 mb-5">
        <p>
          Tu trouveras sur cette page tous les profils qui t&apos;ont adressé un{' '}
          <ColorChip label="like ou flash — à étudier" tone="new" />. Tu pourras
          soit les refuser (pour qu&apos;ils disparaissent de cette page), soit
          les{' '}
          <ColorChip label="mettre en attente" tone="wait" /> (pour les étudier
          plus tard), soit les matcher pour voir ainsi ces profils passer à
          l&apos;étape des matchs. Tous tes matchs seront ensuite soit classés{' '}
          <ColorChip label="1er mot" tone="matched-quiet" />
          , soit classés{' '}
          <ColorChip label="discussion en cours" tone="matched-chat" />{' '}
          lorsqu&apos;il y aura eu au moins un échange.
        </p>
        <p>
          Tu trouveras également sur cette page tous les profils qui ont décliné
          un de tes likes ou de tes flashs. Tu pourras choisir ensuite entre{' '}
          <span className="match-intro-chip match-chip-declined">
            les archiver ou les supprimer
          </span>
          .
        </p>
        <p>
          Un match déjà validé peut être archivé ou rompu depuis la conversation.
          Tu le retrouveras alors dans{' '}
          <span className="match-intro-chip match-chip-broken">
            Matchs rompus
          </span>
          , pour le rétablir ou le supprimer définitivement.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Étages du haut vers le bas : dialogue → match quiet → attente → à étudier */}
      <div className="space-y-6">
        {renderFloor(
          'matched-chat',
          'Discussion en cours',
          floors.matchedChat
        )}
        {renderFloor(
          'matched-quiet',
          '1er mot',
          floors.matchedQuiet
        )}
        {renderWaitFloor()}
        {renderFloor('new', 'Like / Flash à étudier', floors.new)}
        {renderPendingDeclinedFloor()}
        {renderDeclinedArchiveFloor()}
        {renderBrokenFloor()}
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
            openProfile.kind !== 'match' &&
            !openProfile.alreadyLiked &&
            !openProfile.refused
              ? (decision) => void handleInboxDecision(openProfile, decision)
              : undefined
          }
          onWaitingArchive={
            openProfile.waiting || openProfile.refused
              ? () => void handleArchiveWaiting(openProfile)
              : undefined
          }
          onWaitingDiscard={
            openProfile.refused
              ? () => setOpenProfile(null)
              : openProfile.waiting
                ? () => void handleRefuseWaiting(openProfile)
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

      {openArchive && (
        <ProfileDetailModal
          candidate={{
            id: openArchive.profile.id,
            display_name: openArchive.profile.display_name,
            photo_url: openArchive.profile.photo_url,
            age: openArchive.age,
            bio: openArchive.profile.bio,
            location: openArchive.profile.location,
            interests: openArchive.profile.interests,
            is_boosted: openArchive.is_boosted,
            is_founder: openArchive.is_founder,
            founder_number: openArchive.founder_number,
          }}
          alreadyFlashed
          alreadyLiked
          busy={false}
          likesExhausted={false}
          showFlashCta={false}
          inboxHistory={{
            origin: openArchive.origin,
            originLabel: originHistoryLabel(
              openArchive.origin,
              openArchive.declinedAt
            ),
            waiting: false,
            refused: false,
            declinedByThem: true,
            declinedByThemLabel: declinedArchiveStatusLabel(
              openArchive.origin,
              openArchive.declinedAt,
              openArchive.source
            ),
            viewerGender: myGender,
          }}
          onClose={() => setOpenArchive(null)}
          onLike={() => undefined}
          onFlash={() => undefined}
          onSkip={() => setOpenArchive(null)}
        />
      )}

      {openPendingDeclined && (
        <ProfileDetailModal
          candidate={{
            id: openPendingDeclined.profile.id,
            display_name: openPendingDeclined.profile.display_name,
            photo_url: openPendingDeclined.profile.photo_url,
            age: openPendingDeclined.age,
            bio: openPendingDeclined.profile.bio,
            location: openPendingDeclined.profile.location,
            interests: openPendingDeclined.profile.interests,
            is_boosted: openPendingDeclined.is_boosted,
            is_founder: openPendingDeclined.is_founder,
            founder_number: openPendingDeclined.founder_number,
          }}
          alreadyFlashed
          alreadyLiked
          busy={declinedBusyId === openPendingDeclined.notificationId}
          likesExhausted={false}
          showFlashCta={false}
          inboxHistory={{
            origin: openPendingDeclined.origin,
            originLabel: originHistoryLabel(
              openPendingDeclined.origin,
              openPendingDeclined.declinedAt
            ),
            waiting: false,
            refused: false,
            declinedByThem: true,
            declinedByThemLabel: declinedArchiveStatusLabel(
              openPendingDeclined.origin,
              openPendingDeclined.declinedAt
            ),
            viewerGender: myGender,
          }}
          onClose={() => setOpenPendingDeclined(null)}
          onLike={() => undefined}
          onFlash={() => undefined}
          onSkip={() => setOpenPendingDeclined(null)}
          onDeclinedArchive={() =>
            void handlePendingDeclined(openPendingDeclined, true)
          }
          onDeclinedDelete={() =>
            void handlePendingDeclined(openPendingDeclined, false)
          }
        />
      )}

      {openPendingWaiting && (
        <ProfileDetailModal
          candidate={{
            id: openPendingWaiting.profile.id,
            display_name: openPendingWaiting.profile.display_name,
            photo_url: openPendingWaiting.profile.photo_url,
            age: openPendingWaiting.age,
            bio: openPendingWaiting.profile.bio,
            location: openPendingWaiting.profile.location,
            interests: openPendingWaiting.profile.interests,
            is_boosted: openPendingWaiting.is_boosted,
            is_founder: openPendingWaiting.is_founder,
            founder_number: openPendingWaiting.founder_number,
          }}
          alreadyFlashed
          alreadyLiked
          busy={declinedBusyId === openPendingWaiting.notificationId}
          likesExhausted={false}
          showFlashCta={false}
          inboxHistory={{
            origin: openPendingWaiting.origin,
            originLabel: originHistoryLabel(
              openPendingWaiting.origin,
              openPendingWaiting.receivedAt
            ),
            waitingIncoming: true,
            refused: false,
            viewerGender: myGender,
          }}
          onClose={() => setOpenPendingWaiting(null)}
          onLike={() => undefined}
          onFlash={() => undefined}
          onSkip={() => setOpenPendingWaiting(null)}
          onWaitingArchive={() =>
            void handlePendingWaiting(openPendingWaiting, true)
          }
          onWaitingDiscard={() =>
            void handlePendingWaiting(openPendingWaiting, false)
          }
        />
      )}

      {openWaitArchive && (
        <ProfileDetailModal
          candidate={{
            id: openWaitArchive.profile.id,
            display_name: openWaitArchive.profile.display_name,
            photo_url: openWaitArchive.profile.photo_url,
            age: openWaitArchive.age,
            bio: openWaitArchive.profile.bio,
            location: openWaitArchive.profile.location,
            interests: openWaitArchive.profile.interests,
            is_boosted: openWaitArchive.is_boosted,
            is_founder: openWaitArchive.is_founder,
            founder_number: openWaitArchive.founder_number,
          }}
          alreadyFlashed
          alreadyLiked
          busy={declinedBusyId === openWaitArchive.archiveId}
          likesExhausted={false}
          showFlashCta={false}
          inboxHistory={{
            origin: openWaitArchive.origin,
            originLabel: waitArchiveStatusLabel(
              openWaitArchive.origin,
              openWaitArchive.archivedAt,
              openWaitArchive.source
            ),
            refused: false,
            viewerGender: myGender,
          }}
          onClose={() => setOpenWaitArchive(null)}
          onLike={() => undefined}
          onFlash={() => undefined}
          onSkip={() => setOpenWaitArchive(null)}
        />
      )}

      {openBroken && (
        <MatchManageModal
          peer={openBroken.profile}
          mode="broken"
          busy={brokenBusyId === openBroken.archiveId}
          error={null}
          onClose={() => setOpenBroken(null)}
          onRestore={() => void handleBrokenRestore(openBroken)}
          onPurge={() => void handleBrokenPurge(openBroken)}
        />
      )}

      {openWaitingManage && (
        <MatchManageModal
          peer={openWaitingManage.profile}
          mode="waiting"
          origin={openWaitingManage.origin}
          busy={actingId === openWaitingManage.profile.id}
          error={null}
          onClose={() => setOpenWaitingManage(null)}
          onArchive={() => handleArchiveWaiting(openWaitingManage)}
          onPurge={() => setOpenWaitingManage(null)}
        />
      )}
    </div>
  );
}
