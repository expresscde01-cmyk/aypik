import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  ChevronDown,
  Folder,
  Flower2,
  Heart,
  MapPin,
  AlertCircle,
  MessageCircle,
  RefreshCw,
  Zap,
  X,
} from 'lucide-react';
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
import { FounderBadge } from '@/components/membership/Badges';
import { SoftPremiumBanner } from '@/components/membership/SoftPremium';
import { offerLabel } from '@/lib/founderCopy';
import { userErrorMessage } from '@/lib/userError';
import { queryLikeFlashEdges } from '@/lib/likeFlashEdges';
import {
  fetchSocialNotifications,
} from '@/lib/suggestions';
import { fetchPeersWithTwoWayDialogue } from '@/lib/messaging';
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
  waitingByOtherStatusLabel,
  brokenMatchStatusLabel,
  brokenMatchOriginLabel,
  type MatchRole,
} from '@/lib/interactionCopy';
import type { ProfileGender } from '@/components/ProfileSetup';
import ChatBubbleButton from '@/components/ChatBubbleButton';
import MatcherButton from '@/components/MatcherButton';
import MatcherWord, { CrownIcon } from '@/components/MatcherWord';
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
  fetchPendingByOthers,
  isInboxDecisionPending,
  respondToInboxInterest,
  restoreWaitFromArchive,
  type InboxDecision,
} from '@/lib/inboxResponses';
import {
  isMatchedViaWait,
  matchSheetUsesCrown,
  dropPinnedId,
  matchIdsIncludingInboxDecisions,
  inboxMatchAtByActor,
  firstWordEventIso,
  originHistoryIso,
  pinIdsFirst,
  splitPendingByOthers,
} from '@/lib/matchHistoryDisplay';
import { matchCardDepartClass, retainDepartingMatches } from '@/lib/matchCardDepart';
import { useMatchCardDepart } from '@/lib/useMatchCardDepart';
import {
  dropConfirmedInboxDecisionsSeenIn,
  hasConfirmedInboxDecisions,
  mergeConfirmedInboxDecisions,
} from '@/lib/inboxDecisionOverlay';
import {
  waitingDeleteUi,
  waitingManageServerMutation,
} from '@/lib/waitingManageFlow';
import {
  measureStickyHeaderHeight,
  queryStickyHeader,
  resolveMatchFocusScrollTarget,
  scrollYUnderStickyHeader,
} from '@/lib/scrollUnderSticky';
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
  retainMineWaitArchives,
  retainTheirsWaitArchives,
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
  matchBreakSource,
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
  /** Passé par wait avant match (wait_started_at conservé). */
  matchedViaWait: boolean;
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

type WaitingByOtherCard = {
  peerId: string;
  createdAt: string;
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
  source: 'mine' | 'theirs';
};

/** Plus récents en premier (haut/gauche), quel que soit l'étage. */
function sortByDateReceivedDesc(a: Match, b: Match): number {
  const ta = new Date(a.date_received).getTime() || 0;
  const tb = new Date(b.date_received).getTime() || 0;
  return tb - ta;
}

function firstWordIsoOf(match: Match): string {
  return firstWordEventIso({
    matchRole: match.matchRole,
    dateReceived: match.date_received,
    matchedAt: match.matched_at,
    matchedBackAt: match.matchedBackAt,
  });
}

/** « 1er mot » : date d’entrée dans la rubrique (match), pas le like reçu. */
function sortByFirstWordDesc(a: Match, b: Match): number {
  const ta = Date.parse(firstWordIsoOf(a)) || 0;
  const tb = Date.parse(firstWordIsoOf(b)) || 0;
  return tb - ta;
}

function GlossaryMatcherChip() {
  return (
    <span className="match-intro-chip inline-flex items-center border border-rose-100 bg-white text-rose-600">
      <MatcherWord />
    </span>
  );
}

function glossaryIntroComponents() {
  return {
    study: <span className="match-intro-chip match-chip-new" />,
    wait: <span className="match-intro-chip match-chip-wait" />,
    matcher: <GlossaryMatcherChip />,
    holdYou: <span className="match-intro-chip match-chip-wait" />,
    holdThem: <span className="match-intro-chip match-chip-wait-by-other" />,
    purge: <span className="match-intro-chip match-chip-declined" />,
    quiet: <span className="match-intro-chip match-chip-matched-quiet" />,
    chat: <span className="match-intro-chip match-chip-matched-chat" />,
    brokenYou: <span className="match-intro-chip match-chip-broken" />,
    brokenThem: <span className="match-intro-chip match-chip-broken-theirs" />,
    encounters: <span className="match-intro-chip match-chip-souris" />,
  };
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

/** Poubelle — même tracé que RefuseButton / HintActionIcon. */
function RefuseTrashGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g className="refuse-trash-lid">
        <path d="M3 6h18" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </g>
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

/** Chaîne ouverte — même tracé que RestoreLinkButton, état repos. */
function RestoreChainGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`restore-chain ${className ?? ''}`.trim()}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g className="restore-chain-left">
        <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      </g>
      <g className="restore-chain-right">
        <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      </g>
      <path className="restore-chain-bar" d="M8 12h8" />
    </svg>
  );
}

/** Bouquet — SVG statique (légende Après, case blanche). */
function BouquetIcon({
  className = '',
  size = '0.95rem',
}: {
  className?: string;
  size?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <path d="M12.0,22.5 L12.0,16.6" stroke="#5FA05F" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <path d="M12.0,16.6 Q12.0,11.5 12.0,7.4" stroke="#5FA05F" strokeWidth="0.65" strokeLinecap="round" fill="none" opacity="0.75" />
      <path d="M12.0,16.6 Q13.6,12.3 15.2,9.1" stroke="#5FA05F" strokeWidth="0.65" strokeLinecap="round" fill="none" opacity="0.75" />
      <path d="M12.0,16.6 Q13.8,14.3 15.5,13.0" stroke="#5FA05F" strokeWidth="0.65" strokeLinecap="round" fill="none" opacity="0.75" />
      <path d="M12.0,16.6 Q12.3,15.4 12.7,15.2" stroke="#5FA05F" strokeWidth="0.65" strokeLinecap="round" fill="none" opacity="0.75" />
      <path d="M12.0,16.6 Q10.6,14.8 9.2,14.1" stroke="#5FA05F" strokeWidth="0.65" strokeLinecap="round" fill="none" opacity="0.75" />
      <path d="M12.0,16.6 Q10.1,13.1 8.1,10.7" stroke="#5FA05F" strokeWidth="0.65" strokeLinecap="round" fill="none" opacity="0.75" />
      <path d="M12.0,16.6 Q10.9,11.9 9.8,8.1" stroke="#5FA05F" strokeWidth="0.65" strokeLinecap="round" fill="none" opacity="0.75" />
      <circle cx="12.97" cy="7.45" r="1.03" fill="#E11D48" opacity="0.88" />
      <circle cx="12.47" cy="7.97" r="1.13" fill="#E11D48" opacity="0.89" />
      <circle cx="11.08" cy="5.77" r="0.65" fill="#E11D48" opacity="0.86" />
      <circle cx="11.59" cy="5.56" r="1.13" fill="#E11D48" opacity="0.84" />
      <circle cx="12.04" cy="6.17" r="1.25" fill="#E11D48" opacity="0.93" />
      <circle cx="13.22" cy="4.58" r="0.67" fill="#E11D48" opacity="0.86" />
      <circle cx="11.38" cy="5.81" r="1.22" fill="#E11D48" opacity="0.86" />
      <circle cx="13.30" cy="7.71" r="0.72" fill="#E11D48" opacity="0.96" />
      <circle cx="10.48" cy="6.26" r="0.86" fill="#E11D48" opacity="0.88" />
      <circle cx="12.13" cy="6.12" r="1.17" fill="#E11D48" opacity="0.84" />
      <circle cx="12.16" cy="4.96" r="1.23" fill="#E11D48" opacity="0.95" />
      <circle cx="12.06" cy="3.68" r="1.00" fill="#E11D48" opacity="0.92" />
      <circle cx="13.02" cy="6.79" r="1.15" fill="#E11D48" opacity="0.83" />
      <circle cx="14.31" cy="4.59" r="0.90" fill="#E11D48" opacity="0.86" />
      <circle cx="14.59" cy="8.13" r="1.25" fill="#FFE082" opacity="0.87" />
      <circle cx="16.31" cy="7.85" r="1.08" fill="#FFE082" opacity="0.97" />
      <circle cx="14.31" cy="7.80" r="0.98" fill="#FFE082" opacity="0.93" />
      <circle cx="16.07" cy="9.45" r="0.98" fill="#FFE082" opacity="0.91" />
      <circle cx="16.09" cy="8.45" r="0.86" fill="#FFE082" opacity="0.96" />
      <circle cx="14.81" cy="9.15" r="0.83" fill="#FFE082" opacity="0.82" />
      <circle cx="17.87" cy="8.68" r="1.12" fill="#FFE082" opacity="0.86" />
      <circle cx="15.01" cy="6.05" r="1.19" fill="#FFE082" opacity="0.96" />
      <circle cx="12.63" cy="9.83" r="1.23" fill="#FFE082" opacity="0.90" />
      <circle cx="16.85" cy="6.79" r="0.88" fill="#FFE082" opacity="0.84" />
      <circle cx="16.30" cy="7.24" r="0.69" fill="#FFE082" opacity="0.94" />
      <circle cx="16.38" cy="10.92" r="1.15" fill="#A978C5" opacity="0.81" />
      <circle cx="16.12" cy="13.38" r="0.90" fill="#A978C5" opacity="0.83" />
      <circle cx="17.20" cy="12.82" r="1.19" fill="#A978C5" opacity="0.97" />
      <circle cx="16.13" cy="10.92" r="0.80" fill="#A978C5" opacity="0.96" />
      <circle cx="14.18" cy="12.02" r="0.67" fill="#A978C5" opacity="0.84" />
      <circle cx="17.34" cy="10.45" r="1.18" fill="#A978C5" opacity="0.90" />
      <circle cx="14.69" cy="13.08" r="1.16" fill="#A978C5" opacity="0.85" />
      <circle cx="15.19" cy="12.13" r="1.11" fill="#A978C5" opacity="0.80" />
      <circle cx="14.94" cy="9.50" r="0.66" fill="#A978C5" opacity="0.90" />
      <circle cx="14.66" cy="10.43" r="1.00" fill="#A978C5" opacity="0.84" />
      <circle cx="13.55" cy="14.11" r="1.19" fill="#A978C5" opacity="0.82" />
      <circle cx="13.26" cy="15.24" r="0.67" fill="#FFCC80" opacity="0.88" />
      <circle cx="14.39" cy="16.87" r="1.04" fill="#FFCC80" opacity="0.82" />
      <circle cx="11.72" cy="14.66" r="0.95" fill="#FFCC80" opacity="0.84" />
      <circle cx="13.20" cy="15.62" r="0.88" fill="#FFCC80" opacity="0.92" />
      <circle cx="12.43" cy="14.81" r="1.08" fill="#FFCC80" opacity="0.95" />
      <circle cx="13.13" cy="12.74" r="0.65" fill="#FFCC80" opacity="0.88" />
      <circle cx="14.76" cy="15.76" r="0.76" fill="#FFCC80" opacity="0.92" />
      <circle cx="12.76" cy="16.86" r="0.84" fill="#FFCC80" opacity="0.81" />
      <circle cx="11.97" cy="15.62" r="1.19" fill="#FFCC80" opacity="0.85" />
      <circle cx="11.22" cy="14.90" r="1.22" fill="#FFCC80" opacity="0.82" />
      <circle cx="7.55" cy="12.77" r="1.09" fill="#CFD8DC" opacity="0.96" />
      <circle cx="8.03" cy="15.45" r="0.97" fill="#CFD8DC" opacity="0.90" />
      <circle cx="10.86" cy="14.55" r="1.24" fill="#CFD8DC" opacity="0.86" />
      <circle cx="7.11" cy="17.25" r="0.71" fill="#CFD8DC" opacity="0.81" />
      <circle cx="10.80" cy="14.67" r="1.11" fill="#CFD8DC" opacity="0.88" />
      <circle cx="8.57" cy="13.48" r="1.04" fill="#CFD8DC" opacity="0.88" />
      <circle cx="7.51" cy="13.52" r="0.89" fill="#CFD8DC" opacity="0.84" />
      <circle cx="10.02" cy="14.06" r="0.80" fill="#CFD8DC" opacity="0.92" />
      <circle cx="8.29" cy="7.77" r="0.92" fill="#E8C4A8" opacity="0.84" />
      <circle cx="6.38" cy="10.55" r="1.03" fill="#E8C4A8" opacity="0.96" />
      <circle cx="8.70" cy="10.33" r="0.95" fill="#E8C4A8" opacity="0.92" />
      <circle cx="9.15" cy="8.22" r="1.03" fill="#E8C4A8" opacity="0.93" />
      <circle cx="6.25" cy="7.45" r="1.07" fill="#E8C4A8" opacity="0.92" />
      <circle cx="7.55" cy="12.39" r="0.88" fill="#E8C4A8" opacity="0.90" />
      <circle cx="8.93" cy="6.73" r="1.24" fill="#E8C4A8" opacity="0.80" />
      <circle cx="7.06" cy="10.60" r="0.88" fill="#E8C4A8" opacity="0.82" />
      <circle cx="6.99" cy="9.43" r="0.83" fill="#E8C4A8" opacity="0.96" />
      <circle cx="7.40" cy="8.21" r="0.71" fill="#E8C4A8" opacity="0.96" />
      <circle cx="9.12" cy="5.82" r="0.85" fill="#ECEFF1" opacity="0.91" />
      <circle cx="8.96" cy="5.75" r="1.22" fill="#ECEFF1" opacity="0.85" />
      <circle cx="9.30" cy="9.05" r="0.74" fill="#ECEFF1" opacity="0.92" />
      <circle cx="9.88" cy="8.24" r="0.82" fill="#ECEFF1" opacity="0.86" />
      <circle cx="10.67" cy="6.12" r="0.91" fill="#ECEFF1" opacity="0.90" />
      <circle cx="9.21" cy="7.39" r="0.88" fill="#ECEFF1" opacity="0.85" />
      <circle cx="10.56" cy="9.58" r="0.67" fill="#ECEFF1" opacity="0.94" />
      <circle cx="11.15" cy="5.85" r="0.66" fill="#ECEFF1" opacity="0.89" />
      <circle cx="12.93" cy="10.63" r="0.75" fill="#E8C4A8" opacity="0.85" />
      <circle cx="12.01" cy="10.49" r="0.69" fill="#E8C4A8" opacity="0.85" />
      <circle cx="12.50" cy="10.74" r="0.66" fill="#E8C4A8" opacity="0.85" />
      <circle cx="12.53" cy="9.99" r="0.55" fill="#E8C4A8" opacity="0.85" />
      {/* Points blancs — touches de lumière */}
      <circle cx="11.40" cy="4.30" r="0.58" fill="#ffffff" opacity="0.92" />
      <circle cx="13.55" cy="5.90" r="0.52" fill="#ffffff" opacity="0.88" />
      <circle cx="10.15" cy="7.05" r="0.48" fill="#ffffff" opacity="0.90" />
      <circle cx="15.60" cy="7.50" r="0.55" fill="#ffffff" opacity="0.86" />
      <circle cx="17.10" cy="9.70" r="0.50" fill="#ffffff" opacity="0.88" />
      <circle cx="16.50" cy="11.80" r="0.52" fill="#ffffff" opacity="0.85" />
      <circle cx="14.00" cy="13.60" r="0.48" fill="#ffffff" opacity="0.90" />
      <circle cx="12.10" cy="15.90" r="0.55" fill="#ffffff" opacity="0.87" />
      <circle cx="9.50" cy="13.90" r="0.50" fill="#ffffff" opacity="0.89" />
      <circle cx="7.80" cy="11.10" r="0.52" fill="#ffffff" opacity="0.86" />
      <circle cx="7.30" cy="8.60" r="0.48" fill="#ffffff" opacity="0.91" />
      <circle cx="9.70" cy="5.90" r="0.45" fill="#ffffff" opacity="0.87" />
    </svg>
  );
}

function IntroLegendBracket({
  label,
  span,
}: {
  label: string;
  span: 'full' | 'mid' | 'actions';
}) {
  return (
    <div
      className={`match-intro-legend-bracket match-intro-legend-bracket--${span} text-gray-300`}
      aria-hidden
    >
      <span className="match-intro-legend-bracket-line" />
      <span className="match-intro-legend-bracket-label text-gray-500">
        {label}
      </span>
    </div>
  );
}

function IntroLegendBar({
  columns,
  children,
}: {
  columns: 2 | 4 | 'fit' | 'apres';
  children: React.ReactNode;
}) {
  return (
    <div
      className={`match-intro-legend-bar match-intro-legend-bar--${columns}`}
    >
      {children}
    </div>
  );
}

function IntroLegendAvant() {
  const { t } = useTranslation();
  return (
    <div className="match-intro-legend match-intro-legend--avant">
      <div className="match-intro-legend-brackets">
        <IntroLegendBracket label={t('matches.legendLikeOrFlash')} span="full" />
        <IntroLegendBracket label={t('matches.legendSetAside')} span="mid" />
        <IntroLegendBracket label={t('matches.legendA')} span="actions" />
      </div>
      <IntroLegendBar columns={4}>
        <span className="match-intro-legend-seg match-chip-new">
          {t('matches.legendNew')}
        </span>
        <span className="match-intro-legend-seg match-chip-wait">
          {t('matches.legendByYou')}
        </span>
        <span className="match-intro-legend-seg match-chip-wait-by-other">
          {t('matches.legendByThem')}
        </span>
        <span className="match-intro-legend-seg match-intro-legend-seg--actions match-intro-legend-seg--split">
          <span className="sr-only">
            {t('matches.legendActionsHint')}
          </span>
          <span className="match-intro-legend-actions-split" aria-hidden>
            <span className="match-intro-legend-actions-declined">
              <span className="match-intro-legend-icons">
                <RefuseTrashGlyph className="refuse-trash h-3 w-3" />
                <span>,</span>
                <Folder className="h-3 w-3" strokeWidth={2.4} />
              </span>
            </span>
            <span className="match-intro-legend-actions-match">
              <span className="match-intro-legend-match-group">
                <span className="match-intro-legend-icons match-intro-legend-match-icons">
                  <CrownIcon size="0.95rem" />
                </span>
              </span>
            </span>
          </span>
        </span>
      </IntroLegendBar>
    </div>
  );
}

function IntroLegendPendant() {
  const { t } = useTranslation();
  return (
    <div className="match-intro-legend">
      <IntroLegendBar columns={2}>
        <span className="match-intro-legend-seg match-chip-matched-quiet">
          {t('matches.chipFirstWord')}
        </span>
        <span className="match-intro-legend-seg match-chip-matched-chat">
          {t('matches.discussionsInProgress')}
        </span>
      </IntroLegendBar>
    </div>
  );
}

function IntroLegendApres() {
  const { t } = useTranslation();
  return (
    <div className="match-intro-legend">
      <IntroLegendBar columns="apres">
        <span className="match-intro-legend-seg match-chip-broken">
          <span className="match-intro-legend-broken-label">
            <span>{t('matches.brokenMatch')}</span>
            <span>{t('matches.brokenByYou')}</span>
          </span>
        </span>
        <span className="match-intro-legend-seg match-chip-broken-theirs">
          <span className="match-intro-legend-broken-label">
            <span>{t('matches.brokenMatch')}</span>
            <span>{t('matches.brokenByThem')}</span>
          </span>
        </span>
        <span className="match-intro-legend-seg match-chip-souris">
          {t('matches.newCycle')}
        </span>
        <span className="match-intro-legend-seg match-intro-legend-seg--actions match-intro-legend-seg--bouquet">
          <span className="sr-only">{t('matches.bouquetAria')}</span>
          <span className="match-intro-legend-finish-flag" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span
            className="match-intro-legend-actions-match match-intro-legend-actions-match--solo"
            aria-hidden
          >
            <span className="match-intro-legend-match-group">
              <span className="match-intro-legend-icons match-intro-legend-match-icons">
                <BouquetIcon
                  className="match-intro-legend-bouquet-icon"
                  size="1.9rem"
                />
              </span>
            </span>
          </span>
        </span>
      </IntroLegendBar>
    </div>
  );
}

function MatchesGlossary({
  openIntroSection,
  onToggle,
}: {
  openIntroSection: IntroSectionId | null;
  onToggle: (id: IntroSectionId) => void;
}) {
  const { t } = useTranslation();
  const introComponents = glossaryIntroComponents();
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
        {t('matches.glossary')}
      </p>
      <div className="mb-5 space-y-2">
        <IntroAccordionSection
          id="avant"
          title={t('matches.glossaryAvant')}
          titleIcons={
            <>
              <Heart className="w-3.5 h-3.5" fill="currentColor" />
              <Zap className="w-3.5 h-3.5" fill="currentColor" />
            </>
          }
          legend={<IntroLegendAvant />}
          isOpen={openIntroSection === 'avant'}
          onToggle={onToggle}
        >
          <p>
            <Trans i18nKey="matches.introBefore1" components={introComponents} />
          </p>
          <p>
            <Trans i18nKey="matches.introBefore2" components={introComponents} />
          </p>
          <p>
            <Trans i18nKey="matches.introBefore3" components={introComponents} />
          </p>
        </IntroAccordionSection>

        <IntroAccordionSection
          id="pendant"
          title={t('matches.glossaryPendant')}
          titleIcons={<MessageCircle className="w-3.5 h-3.5" />}
          legend={<IntroLegendPendant />}
          isOpen={openIntroSection === 'pendant'}
          onToggle={onToggle}
        >
          <p>
            <Trans i18nKey="matches.introDuring" components={introComponents} />
          </p>
        </IntroAccordionSection>

        <IntroAccordionSection
          id="apres"
          title={t('matches.glossaryApres')}
          titleIcons={
            <>
              <RestoreChainGlyph className="w-3.5 h-3.5" />
              <RefuseTrashGlyph className="refuse-trash w-3.5 h-3.5" />
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={2.4} />
              <span className="mx-0.5 text-[0.65rem] font-medium leading-none">
                {t('matches.orWord')}
              </span>
              <Flower2 className="w-3.5 h-3.5" strokeWidth={2.4} />
            </>
          }
          legend={<IntroLegendApres />}
          isOpen={openIntroSection === 'apres'}
          onToggle={onToggle}
        >
          <p>
            <Trans i18nKey="matches.introAfter1" components={introComponents} />
          </p>
          <p>
            <Trans i18nKey="matches.introAfter2" components={introComponents} />
            <span className="match-intro-dot-cluster" aria-hidden>
              <span className="match-intro-dot match-intro-dot--stage-new" />
              <span className="match-intro-dot match-intro-dot--stage-match" />
              <span className="match-intro-dot match-intro-dot--stage-quiet" />
            </span>
          </p>
        </IntroAccordionSection>
      </div>
    </>
  );
}

type IntroSectionId = 'avant' | 'pendant' | 'apres';

/** Un onglet/accordéon replié par défaut du glossaire "Mes Matchs". */
function IntroAccordionSection({
  id,
  title,
  titleIcons,
  legend,
  isOpen,
  onToggle,
  children,
}: {
  id: IntroSectionId;
  title: string;
  titleIcons: React.ReactNode;
  legend: React.ReactNode;
  isOpen: boolean;
  onToggle: (id: IntroSectionId) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="border border-gray-200 rounded-xl bg-white overflow-hidden"
      style={{ borderLeft: '3px solid #EA580C' }}
    >
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        className="w-full px-4 py-2.5 text-left bg-white hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-gray-800">{title}</span>
            <span
              className="inline-flex items-center gap-0.5 text-gray-400 shrink-0"
              aria-hidden
            >
              {titleIcons}
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${
              isOpen ? 'rotate-180' : ''
            }`}
            aria-hidden
          />
        </span>
        {legend}
      </button>
      {isOpen && (
        <div className="px-4 pb-3 text-sm text-gray-600 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

function MatchStageBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div data-match-stage={label}>
      <p className="text-xs font-semibold tracking-wide text-gray-400 mb-1.5">
        {label}
      </p>
      <div className="space-y-6 border-t border-gray-200 pt-4">{children}</div>
    </div>
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
    const el = document.getElementById(elementId);
    if (!el) return;
    const target = resolveMatchFocusScrollTarget(el) as HTMLElement | null;
    if (!target) return;
    const top = scrollYUnderStickyHeader(
      target.getBoundingClientRect().top,
      window.scrollY,
      measureStickyHeaderHeight(queryStickyHeader())
    );
    window.scrollTo({ top, behavior: 'smooth' });
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
          className="archive-folder h-3 w-3 text-[var(--color-archive-icon)]"
          strokeWidth={2.4}
        />
      ) : (
        <RefuseTrashGlyph className="refuse-trash h-3 w-3 text-gray-500" />
      )}
    </span>
  );
}

function DeclinedActionHint({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t('matches.whatToDoAria')}
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
          aria-label={t('common.closeAria')}
        >
          <X className="w-3.5 h-3.5" strokeWidth={2.4} />
        </button>
        <p className="text-center">
          {t('matches.declinedHintBefore')}{' '}
          <HintActionIcon kind="archive" /> {t('matches.declinedHintMid')}{' '}
          <HintActionIcon kind="delete" /> {t('matches.declinedHintAfter')}
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

function stopMatchCardClick(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

function MatchCardActions({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={CARD_ACTIONS_COL}
      onClick={stopMatchCardClick}
      onPointerDown={stopMatchCardClick}
    >
      {children}
    </div>
  );
}

function CardIdentity({
  name,
  age,
  isFounder,
  founderNumber,
  nameClass = 'text-gray-900',
  ageClass = 'text-gray-400',
}: {
  name: string;
  age: number;
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
      {isFounder ? (
        <div className="mt-0.5">
          <span className="hidden lg:inline-flex">
            <FounderBadge number={founderNumber} size="sm" />
          </span>
          <span className="lg:hidden">
            <FounderBadge size="sm" compact />
          </span>
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
  focusPinActorIds = [],
  focusUnreadMailbox = false,
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
  /** Profils du digest cloche à placer en tête de rubrique. */
  focusPinActorIds?: string[];
  /** Récap messages non lus → conversations en tête. */
  focusUnreadMailbox?: boolean;
  /** Change à chaque navigation cloche → rejoue scroll / ouverture fiche. */
  focusKey?: number;
  onChatClosed?: () => void;
  onFocusActorConsumed?: () => void;
  profileEpoch?: number;
  /** Onglet Matchs visible : resync inbox à la réouverture, sans poll. */
  pageActive?: boolean;
} = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { status, refresh: refreshMembership } = useMembership();
  const { publish, markResolved, clearDigestActor } = useMatchesInboxSync();
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
  const [waitingByOthers, setWaitingByOthers] = useState<WaitingByOtherCard[]>(
    []
  );
  const [brokenMatches, setBrokenMatches] = useState<BrokenMatchCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatPeer, setChatPeer] = useState<Profile | null>(null);
  const [openIntroSection, setOpenIntroSection] =
    useState<IntroSectionId | null>(null);
  const toggleIntroSection = (id: IntroSectionId) =>
    setOpenIntroSection((current) => (current === id ? null : id));
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
  const [openWaitingByOther, setOpenWaitingByOther] =
    useState<WaitingByOtherCard | null>(null);
  const [openBroken, setOpenBroken] = useState<BrokenMatchCard | null>(null);
  /** Modale compacte après « sens interdit » sur une fiche Mis en attente. */
  const [openWaitingManage, setOpenWaitingManage] = useState<Match | null>(null);
  const [brokenBusyId, setBrokenBusyId] = useState<string | null>(null);
  const matchesLoadGen = useRef(0);
  const waitArchivesLoadGen = useRef(0);
  const restoredWaitActorsRef = useRef<Set<string>>(new Set());
  const waitCycleLockRef = useRef<Set<string>>(new Set());
  const [declinedBusyId, setDeclinedBusyId] = useState<string | null>(null);
  const declinedBusyRef = useRef(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actingDecision, setActingDecision] = useState<InboxDecision | null>(
    null
  );
  const actingLockRef = useRef<{
    id: string;
    decision: InboxDecision;
  } | null>(null);

  const beginActing = useCallback((id: string, decision: InboxDecision) => {
    if (actingLockRef.current) return false;
    actingLockRef.current = { id, decision };
    setActingId(id);
    setActingDecision(decision);
    return true;
  }, []);

  const endActing = useCallback(() => {
    actingLockRef.current = null;
    setActingId(null);
    setActingDecision(null);
  }, []);
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
  const [pinActorIds, setPinActorIds] = useState<string[]>([]);
  const [unreadMailbox, setUnreadMailbox] = useState(false);
  const releasePinnedActor = useCallback((profileId: string) => {
    if (!profileId) return;
    setPulseSingleId((current) => (current === profileId ? null : current));
    setPinActorIds((prev) => {
      const next = dropPinnedId(prev, profileId);
      if (next.length === 0) {
        setPulseCategory(null);
        setUnreadMailbox(false);
      }
      return next;
    });
  }, []);
  const { playDepart, isDeparting, departingIdsRef } = useMatchCardDepart();
  const consumeAttentionPulse = useCallback((profileId?: string | null) => {
    setPulseSingleId((current) => {
      if (!profileId || current === profileId) return null;
      return current;
    });
    if (profileId) {
      setPinActorIds((prev) => dropPinnedId(prev, profileId));
    } else {
      setPulseCategory(null);
      setUnreadMailbox(false);
      setPinActorIds([]);
    }
    setDeclinedActionHintId((current) => {
      if (!profileId || current === profileId) return null;
      return current;
    });
  }, []);
  const [peersWithChat, setPeersWithChat] = useState<Set<string>>(
    () => new Set()
  );
  /** Échanges déjà confirmés deux sens (évite un refetch légèrement en retard). */
  const twoWayDialogueRef = useRef<Set<string>>(new Set());
  const [myGender, setMyGender] = useState<ProfileGender | null>(null);
  const pendingFocusRef = useRef<{
    actorId: string;
    openChat: boolean;
    highlight: boolean;
    hintName: string | null;
    pulseCategory: MatchPulseCategory | null;
    pinActorIds: string[];
    declined: boolean;
    waitingIncoming: boolean;
    unreadMailbox: boolean;
    attempts?: number;
  } | null>(null);
  const unread = useUnreadMessages({
    ignoreSenderId: chatPeer?.id ?? null,
  });

  const visitDigestActor = useCallback(
    (profileId?: string | null) => {
      if (!profileId) return;
      clearDigestActor(profileId);
    },
    [clearDigestActor]
  );

  /** Toute interaction avec la fiche (ouvrir le profil, le chat, etc.) arrête le clignotement. */
  const interactWithMatchCard = useCallback(
    (profileId?: string | null) => {
      if (!profileId) return;
      visitDigestActor(profileId);
      releasePinnedActor(profileId);
    },
    [visitDigestActor, releasePinnedActor]
  );

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

      const edges = await queryLikeFlashEdges(
        user.id,
        hasConfirmedInboxDecisions() ? { staleTime: 0 } : undefined
      );
      const sentRes = { data: edges.sentLikes, error: null };
      const receivedRes = { data: edges.receivedLikes, error: null };
      const flashRes = { data: edges.receivedFlashes, error: null };
      const sentFlashRes = { data: edges.sentFlashes, error: null };

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
        const departing = departingIdsRef.current;
        dropConfirmedInboxDecisionsSeenIn(
          inboxSnapshot.filter((row) => !departing.has(row.actor_id))
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

      for (const id of matchIdsIncludingInboxDecisions([], inboxRes)) {
        matchIdSet.add(id);
      }

      const allIds = [
        ...new Set([
          ...matchEntries.map((m) => m.id),
          ...flashEntries.map((f) => f.id),
          ...likeEntries.map((l) => l.id),
          ...matchIdSet,
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
          .filter(
            (r) => r.decision === 'match' && isMatchedViaWait(r.wait_started_at)
          )
          .map((r) => r.actor_id)
      );
      const inboxMatchAtMap = inboxMatchAtByActor(inboxRes);
      if (inboxOk) {
        retainMineWaitArchives(user.id, waitingActors);
      }
      if (pendingOthersOk) {
        retainTheirsWaitArchives(user.id, liveWaitPeerIds);
      }
      if (inboxOk || pendingOthersOk) {
        setWaitArchives((prev) =>
          prev.filter((c) => {
            if (c.source === 'mine') {
              return !inboxOk || waitingActors.has(c.profile.id);
            }
            if (c.source === 'theirs') {
              return !pendingOthersOk || liveWaitPeerIds.has(c.profile.id);
            }
            return true;
          })
        );
      }
      const forceWait = restoredWaitActorsRef.current;

      let peersChat = new Set<string>();
      try {
        peersChat = await fetchPeersWithTwoWayDialogue();
      } catch {
        peersChat = new Set();
      }
      setPeersWithChat(() => {
        const next = new Set(peersChat);
        for (const id of twoWayDialogueRef.current) next.add(id);
        return next;
      });

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
          const inboxMatchAt = inboxMatchAtMap.get(p.id) || null;
          const outgoingAt = matchBackAt.get(p.id) || mine || null;
          const matchedBackAt = isMatched
            ? inboxMatchAt || outgoingAt
            : outgoingAt;
          return {
            profile: p,
            age: ageFromBirthDate(p.birth_date),
            date_received: at || '',
            matched_at: at || '',
            kind,
            origin,
            matchedBackAt,
            alreadyLiked:
              sentSet.has(p.id) ||
              outgoingFlashMap.has(p.id) ||
              matchIdSet.has(p.id),
            matchRole,
            waiting,
            waitingAt: waiting ? waitingAtMap.get(p.id) ?? null : null,
            refused: false,
            matchedViaWait:
              isMatched &&
              (viaWaitOwn.has(p.id) || matchedViaWaitPeerIds.has(p.id)),
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
      setMatches((prev) =>
        retainDepartingMatches(prev, list, departingIdsRef.current)
      );
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
      try {
        const inboxRes = mergeConfirmedInboxDecisions(
          await fetchInboxResponses()
        );
        if (gen !== waitArchivesLoadGen.current) return;
        retainMineWaitArchives(
          user.id,
          inboxRes.filter((r) => r.decision === 'wait').map((r) => r.actor_id)
        );
      } catch {
        /* conserve le store local si l’inbox ne répond pas */
      }
      try {
        const pendingOthers = await fetchPendingByOthers();
        if (gen !== waitArchivesLoadGen.current) return;
        retainTheirsWaitArchives(
          user.id,
          splitPendingByOthers(pendingOthers).liveWaits.map((row) => row.peer_id)
        );
      } catch {
        /* conserve les archives « par l’autre » si le RPC ne répond pas */
      }
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
        return list.find((c) => c.archiveId === open.archiveId) ?? null;
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

  const loadWaitingByOthers = useCallback(async () => {
    if (!user) {
      setWaitingByOthers([]);
      return;
    }
    try {
      const rows = await fetchPendingByOthers();
      const { liveWaits } = splitPendingByOthers(rows);
      retainTheirsWaitArchives(
        user.id,
        liveWaits.map((row) => row.peer_id)
      );
      setWaitArchives((prev) =>
        prev.filter(
          (c) =>
            c.source !== 'theirs' ||
            liveWaits.some((row) => row.peer_id === c.profile.id)
        )
      );
      setOpenWaitArchive((open) => {
        if (!open || open.source !== 'theirs') return open;
        return liveWaits.some((row) => row.peer_id === open.profile.id)
          ? open
          : null;
      });
      if (liveWaits.length === 0) {
        setWaitingByOthers([]);
        setOpenWaitingByOther(null);
        setError((prev) =>
          prev?.includes('COLLER-PENDING-BY-OTHERS') ? null : prev
        );
        return;
      }
      const { byId, founderMap, boostSet } = await fetchProfileBundle(
        [...new Set(liveWaits.map((r) => r.peer_id))]
      );
      const list: WaitingByOtherCard[] = [];
      for (const row of liveWaits) {
        const profile = byId.get(row.peer_id);
        if (!profile) continue;
        list.push({
          peerId: row.peer_id,
          createdAt: row.created_at,
          origin: row.origin,
          profile,
          age: ageFromBirthDate(profile.birth_date),
          is_founder: founderMap.has(profile.id),
          founder_number: founderMap.get(profile.id) ?? null,
          is_boosted: boostSet.has(profile.id),
        });
      }
      list.sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
      );
      setWaitingByOthers(list);
      setOpenWaitingByOther((open) => {
        if (!open) return open;
        return list.find((c) => c.peerId === open.peerId) ?? null;
      });
      setError((prev) =>
        prev?.includes('COLLER-PENDING-BY-OTHERS') ? null : prev
      );
    } catch {
      setWaitingByOthers([]);
      setOpenWaitingByOther(null);
      setError((prev) =>
        prev?.includes('COLLER-PENDING-BY-OTHERS') ? null : prev
      );
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
          source: matchBreakSource(row.action, row.initiated_by, user.id),
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
      setError(userErrorMessage(err, t('matches.loadBrokenError')));
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
        loadWaitingByOthers(),
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
    loadWaitingByOthers,
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
    void loadWaitingByOthers();
    void loadBrokenMatches();
  }, [
    pageActive,
    loadMatches,
    loadDeclinedArchives,
    loadPendingDeclined,
    loadWaitArchives,
    loadPendingWaiting,
    loadWaitingByOthers,
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
      void loadWaitingByOthers();
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
      !focusWaitingIncoming &&
      !focusUnreadMailbox &&
      focusPinActorIds.length === 0
    ) {
      return;
    }
    pendingFocusRef.current = {
      actorId: focusActorId || '',
      openChat: focusOpenChat,
      highlight: focusHighlight,
      hintName: focusHintName,
      pulseCategory: resolvedCategory,
      pinActorIds: focusPinActorIds,
      declined: focusDeclined,
      waitingIncoming: focusWaitingIncoming,
      unreadMailbox: focusUnreadMailbox,
    };
  }, [
    focusActorId,
    focusOpenChat,
    focusHighlight,
    focusHintName,
    focusPulseCategory,
    focusPulsePendingAll,
    focusPinActorIds,
    focusDeclined,
    focusWaitingIncoming,
    focusUnreadMailbox,
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
      const liveCard = findByHint(waitingByOthers);
      const pendingCard = findByHint(pendingWaiting);
      const archivedCard = findByHint(waitArchives);
      const card = liveCard || pendingCard || archivedCard;
      pendingFocusRef.current = null;
      onFocusActorConsumed?.();
      if (!card) return;
      setPulseCategory(null);
      setPulseSingleId(card.profile.id);
      const elId = liveCard
        ? `match-card-wait-by-other-${liveCard.peerId}`
        : pendingCard
          ? `match-card-wait-pending-${pendingCard.notificationId}`
          : `match-card-wait-archive-${archivedCard?.archiveId ?? ''}`;
      scrollMatchCardIntoView(elId);
      if (liveCard) setOpenWaitingByOther(liveCard);
      else if (pendingCard) setOpenPendingWaiting(pendingCard);
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

    if (pending.unreadMailbox) {
      pendingFocusRef.current = null;
      onFocusActorConsumed?.();
      setUnreadMailbox(true);
      setPulseCategory(null);
      setPinActorIds(pending.pinActorIds || []);
      setPulseSingleId(null);
      setOpenProfile(null);
      const firstPin = (pending.pinActorIds || [])[0];
      if (firstPin) {
        scrollMatchCardIntoView(`match-card-${firstPin}`);
      } else {
        scrollMatchCardIntoView('match-floor-matched-chat');
      }
      return;
    }

    if (pending.pulseCategory && !pending.highlight) {
      // Exclusif : A remplace B et inversement
      setPulseCategory(pending.pulseCategory);
      setUnreadMailbox(false);
      setPinActorIds(pending.pinActorIds || []);
      setPulseSingleId(pending.actorId || null);
      const floorId =
        pending.pulseCategory === 'wait'
          ? 'match-floor-wait'
          : pending.pulseCategory === 'first'
            ? 'match-floor-matched-quiet'
            : 'match-floor-new';
      const firstPin = pending.actorId || (pending.pinActorIds || [])[0];
      scrollMatchCardIntoView(
        firstPin ? `match-card-${firstPin}` : floorId
      );
      if (pending.actorId) {
        const foundCard = matches.find((m) => m.profile.id === pending.actorId);
        if (!foundCard) {
          return;
        }
        pendingFocusRef.current = null;
        onFocusActorConsumed?.();
        interactWithMatchCard(foundCard.profile.id);
        setOpenProfile(foundCard);
        return;
      }
      pendingFocusRef.current = null;
      onFocusActorConsumed?.();
      setOpenProfile(null);
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
      interactWithMatchCard(found.profile.id);
      setChatPeer(found.profile);
      return;
    }

    if (pending.highlight) {
      setPulseCategory(null);
      scrollMatchCardIntoView(`match-card-${found.profile.id}`);
      interactWithMatchCard(found.profile.id);
      setOpenProfile(found);
      return;
    }

    setPulseCategory(null);
    scrollMatchCardIntoView(`match-card-${found.profile.id}`);
    interactWithMatchCard(found.profile.id);
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
    focusPinActorIds,
    focusKey,
    onFocusActorConsumed,
    peersWithChat,
    unread.bySender,
    pendingDeclined,
    declinedArchives,
    pendingWaiting,
    waitArchives,
    waitingByOthers,
    loadPendingDeclined,
    loadDeclinedArchives,
    interactWithMatchCard,
  ]);

  const handleMatchBack = useCallback(
    async (item: Match) => {
      if (
        !user ||
        likesExhausted ||
        item.alreadyLiked ||
        item.kind === 'match'
      ) {
        return;
      }
      if (!beginActing(item.profile.id, 'match')) return;
      setError(null);
      try {
        forgetClearedWait(user.id, item.profile.id);
        const result = await respondToInboxInterest(
          item.profile.id,
          'match',
          item.origin
        );
        if (!result.ok || result.decision !== 'match') {
          throw new Error('match_not_persisted');
        }
        const matchedAt = result.matched_at || new Date().toISOString();
        const confirmed: Match = {
          ...item,
          kind: 'match',
          alreadyLiked: true,
          waiting: false,
          waitingAt: null,
          refused: false,
          matchRole: 'accepted',
          matchedBackAt: matchedAt,
          matchedViaWait: Boolean(item.waiting),
        };
        setOpenProfile(null);
        await playDepart(item.profile.id, () => {
          setMatches((prev) =>
            prev.map((m) => (m.profile.id === item.profile.id ? confirmed : m))
          );
          markResolved(item.profile.id, 'matched');
          releasePinnedActor(item.profile.id);
        });
        await Promise.all([loadMatches(), refreshMembership()]);
      } catch (err) {
        setError(userErrorMessage(err, t('matches.validateMatchError')));
      } finally {
        endActing();
      }
    },
    [user, likesExhausted, loadMatches, refreshMembership, markResolved, releasePinnedActor, beginActing, endActing, playDepart]
  );

  const handleInboxDecision = useCallback(
    async (item: Match, decision: InboxDecision) => {
      if (!user) return;
      if (decision === 'match' && likesExhausted) return;
      if (item.kind === 'match' || item.alreadyLiked) return;
      if (item.waiting && decision === 'wait') return;

      if (decision === 'match') {
        await handleMatchBack(item);
        return;
      }

      if (!beginActing(item.profile.id, decision)) return;
      setError(null);
      try {
        forgetClearedWait(user.id, item.profile.id);
        await respondToInboxInterest(item.profile.id, decision, item.origin);
        setOpenProfile(null);
        await playDepart(item.profile.id, () => {
          if (decision === 'refuse') {
            forgetWaitArchive(user.id, item.profile.id);
            setWaitArchives((prev) =>
              prev.filter((c) => c.profile.id !== item.profile.id)
            );
            setMatches((prev) =>
              prev.filter((m) => m.profile.id !== item.profile.id)
            );
            markResolved(item.profile.id, 'refused');
            releasePinnedActor(item.profile.id);
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
            releasePinnedActor(item.profile.id);
            setPulseSingleId(item.profile.id);
          }
        });
      } catch (err) {
        setError(userErrorMessage(err, t('matches.decisionError')));
      } finally {
        endActing();
      }
    },
    [user, likesExhausted, handleMatchBack, markResolved, releasePinnedActor, beginActing, endActing, playDepart]
  );

  const handleRefuseWaiting = useCallback((item: Match) => {
    if (!user || actingLockRef.current) return;
    if (item.kind === 'match' || item.alreadyLiked) return;
    if (waitingManageServerMutation('open-manage') !== 'none') return;
    setOpenWaitingManage(item);
    setOpenProfile(null);
    setError(null);
  }, [user]);

  const handlePurgeWaiting = useCallback(
    async (item: Match) => {
      if (!user) return;
      if (item.kind === 'match' || item.alreadyLiked) return;
      if (waitingManageServerMutation('manage-purge') !== 'refuse') {
        return;
      }

      if (!beginActing(item.profile.id, 'refuse')) return;
      setError(null);
      matchesLoadGen.current += 1;
      forgetClearedWait(user.id, item.profile.id);
      restoredWaitActorsRef.current.delete(item.profile.id);
      try {
        await respondToInboxInterest(item.profile.id, 'refuse', item.origin);
        setOpenWaitingManage(null);
        setOpenProfile(null);
        await playDepart(item.profile.id, () => {
          forgetWaitArchive(user.id, item.profile.id);
          setWaitArchives((prev) =>
            prev.filter((c) => c.profile.id !== item.profile.id)
          );
          setMatches((prev) =>
            prev.filter((m) => m.profile.id !== item.profile.id)
          );
          markResolved(item.profile.id, 'refused');
          releasePinnedActor(item.profile.id);
        });
      } catch (err) {
        setError(userErrorMessage(err, t('matches.decisionError')));
      } finally {
        endActing();
      }
    },
    [user, markResolved, releasePinnedActor, beginActing, endActing, playDepart]
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
      await playDepart(card.profile.id, () => {
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
      });
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
              ? t('matches.archiveProfileError')
              : t('matches.deleteNotifError')
          )
        );
        if (archive) await loadDeclinedArchives();
      } finally {
        declinedBusyRef.current = false;
        setDeclinedBusyId(null);
      }
    },
    [user, loadDeclinedArchives, consumeAttentionPulse, playDepart]
  );

  const handleArchiveWaiting = useCallback(
    async (item: Match) => {
      if (!user) return;
      if (item.kind === 'match' || item.alreadyLiked) return;
      const actorId = item.profile.id;
      if (waitCycleLockRef.current.has(actorId)) return;
      waitCycleLockRef.current.add(actorId);
      setError(null);
      setOpenProfile(null);
      setOpenWaitingManage(null);
      await playDepart(actorId, () => {
        waitArchivesLoadGen.current += 1;
        matchesLoadGen.current += 1;
        restoredWaitActorsRef.current.delete(actorId);
        rememberMineWaitArchive(user.id, {
          actorId,
          origin: item.origin,
          receivedAt: item.date_received,
        });
        releasePinnedActor(actorId);
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
      });
      waitCycleLockRef.current.delete(actorId);
      if (item.refused) {
        void restoreWaitFromArchive(actorId, item.origin, { silent: true });
      }
      void dismissWaitingNotification({
        actorId,
        kinds: ['match_wait_reminder'],
      }).catch(() => undefined);
    },
    [user, releasePinnedActor, playDepart]
  );

  const handlePendingWaiting = useCallback(
    async (card: PendingWaitingCard, archive: boolean) => {
      if (!user || declinedBusyRef.current) return;
      declinedBusyRef.current = true;
      setDeclinedBusyId(card.notificationId);
      setError(null);
      setOpenPendingWaiting(null);
      await playDepart(card.profile.id, () => {
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
      });
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
              ? t('matches.archiveProfileError')
              : t('matches.deleteNotifError')
          )
        );
        await loadPendingWaiting();
        await loadWaitArchives();
      } finally {
        declinedBusyRef.current = false;
        setDeclinedBusyId(null);
      }
    },
    [user, loadPendingWaiting, loadWaitArchives, playDepart]
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
      await playDepart(card.profile.id, () => {
        setWaitArchives((prev) =>
          prev.filter(
            (c) =>
              c.archiveId !== card.archiveId && c.profile.id !== card.profile.id
          )
        );
        forgetWaitArchive(user.id, card.profile.id);
        if (card.source === 'mine') {
          forgetClearedWait(user.id, card.profile.id);
          setMatches((prev) =>
            prev.filter((m) => m.profile.id !== card.profile.id)
          );
          markResolved(card.profile.id, 'refused');
        }
      });
      try {
        if (card.source === 'mine') {
          await respondToInboxInterest(
            card.profile.id,
            'refuse',
            card.origin
          );
        }
      } catch (err) {
        setError(
          userErrorMessage(err, t('matches.deleteArchiveError'))
        );
        await loadWaitArchives();
        await loadMatches();
      } finally {
        declinedBusyRef.current = false;
        setDeclinedBusyId(null);
      }
    },
    [user, markResolved, loadWaitArchives, loadMatches, playDepart]
  );

  const handleRestoreWaitArchive = useCallback(
    async (card: WaitArchiveCard) => {
      if (!user) return;
      if (card.source !== 'mine') return;
      const actorId = card.profile.id;
      if (waitCycleLockRef.current.has(actorId)) return;
      waitCycleLockRef.current.add(actorId);
      setError(null);
      setOpenWaitArchive((open) =>
        open?.archiveId === card.archiveId ? null : open
      );
      await playDepart(actorId, () => {
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
            matchedViaWait: false,
            is_founder: card.is_founder,
            founder_number: card.founder_number,
            is_boosted: card.is_boosted,
          };
          return [incoming, ...prev];
        });
        markResolved(actorId, 'wait');
      });
      waitCycleLockRef.current.delete(actorId);
      void restoreWaitFromArchive(actorId, card.origin, { silent: true });
    },
    [user, markResolved, playDepart]
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
      await playDepart(card.profile.id, () => {
        setDeclinedArchives((prev) =>
          prev.filter(
            (c) =>
              c.archiveId !== card.archiveId && c.profile.id !== card.profile.id
          )
        );
      });
      try {
        await deleteDeclinedArchive(card.archiveId, card.profile.id);
      } catch (err) {
        setError(
          userErrorMessage(err, t('matches.deleteArchiveError'))
        );
      } finally {
        declinedBusyRef.current = false;
        setDeclinedBusyId(null);
      }
    },
    [consumeAttentionPulse, playDepart]
  );

  const handleBrokenRestore = useCallback(
    async (card: BrokenMatchCard) => {
      if (card.source !== 'mine') return;
      if (brokenBusyId) return;
      setBrokenBusyId(card.archiveId);
      setError(null);
      try {
        await restoreBrokenMatch(card.profile.id);
        setOpenBroken(null);
        await playDepart(card.profile.id, () => {
          setBrokenMatches((prev) =>
            prev.filter((c) => c.archiveId !== card.archiveId)
          );
        });
        await Promise.all([loadMatches(), loadBrokenMatches()]);
      } catch (err) {
        setError(userErrorMessage(err, t('matches.restoreMatchError')));
        await loadBrokenMatches();
      } finally {
        setBrokenBusyId(null);
      }
    },
    [brokenBusyId, loadMatches, loadBrokenMatches, playDepart]
  );

  const handleBrokenPurge = useCallback(
    async (card: BrokenMatchCard) => {
      if (brokenBusyId) return;
      setBrokenBusyId(card.archiveId);
      setError(null);
      try {
        await purgeBrokenMatch(card.profile.id);
        setOpenBroken(null);
        await playDepart(card.profile.id, () => {
          setBrokenMatches((prev) =>
            prev.filter((c) => c.archiveId !== card.archiveId)
          );
          setPeersWithChat((prev) => {
            if (!prev.has(card.profile.id)) return prev;
            const next = new Set(prev);
            next.delete(card.profile.id);
            return next;
          });
        });
      } catch (err) {
        setError(
          userErrorMessage(err, t('matches.purgeError'))
        );
        await loadBrokenMatches();
      } finally {
        setBrokenBusyId(null);
      }
    },
    [brokenBusyId, loadBrokenMatches, playDepart]
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
      const hasDialogue = peersWithChat.has(match.profile.id);
      let floor: MatchFloor;
      if (match.waiting) floor = 'wait';
      else if (isMatched) floor = hasDialogue ? 'matched-chat' : 'matched-quiet';
      else floor = 'new';
      buckets[floor].push(match);
    }
    return {
      new: pinIdsFirst(
        buckets.new.sort(sortByDateReceivedDesc),
        pulseCategory === 'new' ? pinActorIds : [],
        (m) => m.profile.id
      ),
      wait: pinIdsFirst(
        buckets.wait
          .filter(
            (m) => !user || !isMineWaitArchived(user.id, m.profile.id)
          )
          .sort(sortByDateReceivedDesc),
        pulseCategory === 'wait' ? pinActorIds : [],
        (m) => m.profile.id
      ),
      matchedQuiet: pinIdsFirst(
        buckets['matched-quiet'].sort(sortByFirstWordDesc),
        pulseCategory === 'first' || unreadMailbox ? pinActorIds : [],
        (m) => m.profile.id
      ),
      matchedChat: pinIdsFirst(
        buckets['matched-chat'].sort(sortByDateReceivedDesc),
        unreadMailbox ? pinActorIds : [],
        (m) => m.profile.id
      ),
    };
  }, [
    matches,
    peersWithChat,
    user,
    waitArchives,
    brokenPeerIds,
    pulseCategory,
    pinActorIds,
    unreadMailbox,
  ]);

  useEffect(() => {
    if (pinActorIds.length === 0 && unreadMailbox) {
      setUnreadMailbox(false);
    }
  }, [unreadMailbox, pinActorIds.length]);

  useEffect(() => {
    if (loading || pinActorIds.length === 0) return;
    if (!pulseCategory && !unreadMailbox) return;
    const live =
      pulseCategory === 'new'
        ? floors.new
        : pulseCategory === 'wait'
          ? floors.wait
          : pulseCategory === 'first'
            ? floors.matchedQuiet
            : unreadMailbox
              ? [...floors.matchedQuiet, ...floors.matchedChat]
              : [];
    const liveIds = new Set(live.map((m) => m.profile.id));
    setPinActorIds((prev) => {
      const next = prev.filter((id) => liveIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [
    loading,
    pulseCategory,
    unreadMailbox,
    pinActorIds,
    floors.new,
    floors.wait,
    floors.matchedQuiet,
    floors.matchedChat,
  ]);

  const visibleWaitArchives = useMemo(() => {
    const matchedIds = new Set(
      matches
        .filter(
          (m) =>
            m.kind === 'match' || m.alreadyLiked || m.matchedViaWait
        )
        .map((m) => m.profile.id)
    );
    return waitArchives
      .filter((card) => !matchedIds.has(card.profile.id))
      .sort(
        (a, b) => Date.parse(b.archivedAt) - Date.parse(a.archivedAt)
      );
  }, [waitArchives, matches]);

  const visibleWaitingByOthers = useMemo(() => {
    const hideIds = new Set<string>();
    for (const m of matches) {
      if (m.kind === 'match') hideIds.add(m.profile.id);
    }
    for (const id of brokenPeerIds) hideIds.add(id);
    return waitingByOthers
      .filter((card) => !hideIds.has(card.profile.id))
      .sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
      );
  }, [waitingByOthers, matches, brokenPeerIds]);

  const waitLivePeerIds = useMemo(
    () => new Set(visibleWaitingByOthers.map((c) => c.profile.id)),
    [visibleWaitingByOthers]
  );
  const hasPendantStage =
    floors.matchedChat.length > 0 || floors.matchedQuiet.length > 0;
  const hasAvantStage =
    floors.new.length > 0 ||
    floors.wait.length > 0 ||
    visibleWaitingByOthers.length > 0 ||
    visibleWaitArchives.some((c) => c.source === 'mine') ||
    visibleWaitArchives.some(
      (c) => c.source === 'theirs' && !waitLivePeerIds.has(c.profile.id)
    ) ||
    pendingDeclined.length > 0 ||
    declinedArchives.length > 0;
  const hasApresStage = brokenMatches.length > 0;

  /** Source de vérité pour la cloche : états des cartes Mes Matchs. */
  useEffect(() => {
    const next: MatchesInboxEntry[] = matches
      .filter((match) => {
        if (brokenPeerIds.has(match.profile.id)) return false;
        if (
          match.waiting &&
          user &&
          isMineWaitArchived(user.id, match.profile.id)
        ) {
          return false;
        }
        return true;
      })
      .map((match) => {
      const isPending = match.kind !== 'match';
      const isMatched = !isPending || match.alreadyLiked;
      const hasDialogue = peersWithChat.has(match.profile.id);
      let status: MatchesInboxStatus;
      if (match.waiting) status = 'wait';
      else if (isMatched) status = hasDialogue ? 'matched-chat' : 'matched';
      else status = 'new';
      return {
        id: match.profile.id,
        displayName: (match.profile.display_name || '').trim() || t('common.someone'),
        status,
        origin: match.origin,
      };
    });
    publish(next);
  }, [matches, peersWithChat, publish, brokenPeerIds, user, waitArchives]);

  const renderMatchCard = (match: Match) => {
    const isPending = match.kind !== 'match';
    const isFlash = match.origin === 'flash';
    const isMatched = !isPending || match.alreadyLiked;
    const unreadCount = unread.bySender[match.profile.id] || 0;
    const hasDialogue = peersWithChat.has(match.profile.id);
    const matchDateIso = firstWordIsoOf(match);
    const statusLabel = match.waiting
      ? waitingMatchReminder(match.origin, myGender)
      : isMatched
        ? hasDialogue
          ? matchedWithDialogueLabel(matchDateIso, match.matchRole)
          : matchedNoDialogueLabel(matchDateIso, match.matchRole)
        : pendingToDecideLabel(match.origin, match.date_received);

    const receivedLabel = formatInteractionDate(match.date_received);
    const isToStudy = isPending && !match.waiting && !match.alreadyLiked;
    const cardActing = actingId === match.profile.id;
    const isQuietMatch = isMatched && !hasDialogue && !match.waiting;
    const pinSet =
      pinActorIds.length > 0 ? new Set(pinActorIds) : null;
    const inPin = (id: string) => Boolean(pinSet?.has(id));
    const shouldPulse = match.waiting
      ? (pulseCategory === 'wait' && inPin(match.profile.id)) ||
        pulseSingleId === match.profile.id
      : isToStudy &&
          ((pulseCategory === 'new' && inPin(match.profile.id)) ||
            pulseSingleId === match.profile.id)
        ? true
        : isQuietMatch &&
          ((pulseCategory === 'first' && inPin(match.profile.id)) ||
            pulseSingleId === match.profile.id);

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
        className={matchCardDepartClass(
          `rounded-2xl p-4 flex items-center gap-3 transition-shadow animate-fadeIn cursor-pointer ${cardTone}`,
          isDeparting(match.profile.id)
        )}
        onClick={() => {
          interactWithMatchCard(match.profile.id);
          setOpenProfile(match);
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            interactWithMatchCard(match.profile.id);
            setOpenProfile(match);
          }}
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
          <MatchCardActions>
            <MatcherButton
              name={match.profile.display_name}
              busy={isInboxDecisionPending(
                actingId,
                actingDecision,
                match.profile.id,
                'match'
              )}
              locked={cardActing && actingDecision !== 'match'}
              disabled={likesExhausted}
              matched={match.alreadyLiked}
              tooltip={cardActionTooltip(0, isToStudy || match.waiting ? 3 : 2)}
              onClick={() => void handleMatchBack(match)}
            />
            {match.waiting ? (
              <ArchiveButton
                name={match.profile.display_name}
                locked={cardActing}
                tooltip={cardActionTooltip(1, 3)}
                onClick={() => void handleArchiveWaiting(match)}
              />
            ) : isToStudy ? (
              <WaitButton
                name={match.profile.display_name}
                busy={isInboxDecisionPending(
                  actingId,
                  actingDecision,
                  match.profile.id,
                  'wait'
                )}
                locked={cardActing && actingDecision !== 'wait'}
                tooltip={cardActionTooltip(1, 3)}
                onClick={() => void handleInboxDecision(match, 'wait')}
              />
            ) : null}
            <RefuseButton
              name={match.profile.display_name}
              busy={isInboxDecisionPending(
                actingId,
                actingDecision,
                match.profile.id,
                'refuse'
              )}
              locked={cardActing && actingDecision !== 'refuse'}
              tooltip={cardActionTooltip(
                isToStudy || match.waiting ? 2 : 1,
                isToStudy || match.waiting ? 3 : 2
              )}
              variant={match.waiting ? 'ban' : 'trash'}
              label={match.waiting ? t('matches.throwAway') : t('common.delete')}
              onClick={() => {
                if (match.waiting) {
                  if (waitingDeleteUi('card-ban') === 'open-manage') {
                    void handleRefuseWaiting(match);
                  }
                  return;
                }
                void handleInboxDecision(match, 'refuse');
              }}
            />
          </MatchCardActions>
        ) : (
          <div
            onClick={stopMatchCardClick}
            onPointerDown={stopMatchCardClick}
          >
            <ChatBubbleButton
              name={match.profile.display_name}
              unreadCount={unreadCount}
              onClick={() => {
                interactWithMatchCard(match.profile.id);
                setChatPeer(match.profile);
              }}
            />
          </div>
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
      <section
        id={`match-floor-${floor}`}
        className="space-y-2"
        aria-label={title}
      >
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
        className={matchCardDepartClass(
          `rounded-2xl p-4 flex items-center gap-3 transition-shadow animate-fadeIn cursor-pointer ${
            theirs ? 'match-card-wait-theirs' : 'match-card-wait-archive'
          }${
            pulseSingleId === card.profile.id ? ' match-card-attention-pulse' : ''
          }`,
          isDeparting(card.profile.id)
        )}
        onClick={() => {
          consumeAttentionPulse(card.profile.id);
          setOpenWaitArchive(card);
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
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

        <MatchCardActions>
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
            label={t('common.delete')}
            tooltip={cardActionTooltip(
              card.source === 'mine' ? 1 : 0,
              card.source === 'mine' ? 2 : 1
            )}
            onClick={() => void handleDeleteWaitArchive(card)}
          />
        </MatchCardActions>
      </div>
    );
  };

  const renderWaitingByOtherCard = (card: WaitingByOtherCard) => {
    const isFlash = card.origin === 'flash';
    return (
      <div
        id={`match-card-wait-by-other-${card.peerId}`}
        key={card.peerId}
        data-match-state="wait-by-other"
        className={matchCardDepartClass(
          `rounded-2xl p-4 flex items-center gap-3 transition-shadow animate-fadeIn cursor-pointer match-card-wait-by-other${
            pulseSingleId === card.profile.id ? ' match-card-attention-pulse' : ''
          }`,
          isDeparting(card.profile.id)
        )}
        onClick={() => {
          consumeAttentionPulse(card.profile.id);
          setOpenWaitingByOther(card);
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            consumeAttentionPulse(card.profile.id);
            setOpenWaitingByOther(card);
          }}
          className="match-card-photo relative w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-amber-50 to-orange-50 flex-shrink-0"
          aria-label={`Voir le profil de ${card.profile.display_name}`}
        >
          {card.profile.photo_url ? (
            <ProfilePhoto
              src={card.profile.photo_url}
              width={112}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-amber-700/60">
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
            isFounder={card.is_founder}
            founderNumber={card.founder_number}
            nameClass="text-amber-950"
            ageClass="text-amber-900/60"
          />
          {card.profile.location && (
            <p className="text-xs flex items-center gap-1 mt-0.5 text-amber-900/70">
              <MapPin className="w-3 h-3" />
              {card.profile.location}
            </p>
          )}
          <p className="text-xs mt-1 text-amber-950/80">
            {waitingByOtherStatusLabel(card.origin, card.createdAt)}
          </p>
        </div>
      </div>
    );
  };

  const renderWaitFloor = () => {
    const mineActive = floors.wait;
    const mineArchived = visibleWaitArchives.filter((c) => c.source === 'mine');
    const theirsLive = visibleWaitingByOthers;
    const livePeerIds = new Set(theirsLive.map((c) => c.profile.id));
    const theirsArchived = visibleWaitArchives.filter(
      (c) => c.source === 'theirs' && !livePeerIds.has(c.profile.id)
    );
    if (
      mineActive.length === 0 &&
      theirsLive.length === 0 &&
      mineArchived.length === 0 &&
      theirsArchived.length === 0
    ) {
      return null;
    }
    return (
      <section id="match-floor-wait" className="space-y-6" aria-label={t('matches.floorWaitingByYou')}>
        {mineActive.length > 0 ? (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 tracking-wide">
              <ColorChip label={t('matches.floorWaitingByYou')} tone="wait" />
              <span className="text-gray-400 font-normal">
                ({mineActive.length})
              </span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {mineActive.map((m) => renderMatchCard(m))}
            </div>
          </div>
        ) : null}
        {theirsLive.length > 0 ? (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 tracking-wide">
              <span className="match-intro-chip match-chip-wait-by-other">
                {t('matches.floorWaitingByOther')}
              </span>
              <span className="text-gray-400 font-normal">
                ({theirsLive.length})
              </span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {theirsLive.map((card) => renderWaitingByOtherCard(card))}
            </div>
          </div>
        ) : null}
        {mineArchived.length > 0 ? (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 tracking-wide">
              <span className="match-intro-chip match-chip-wait-archive">
                {t('matches.floorWaitingArchiveYou')}
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
                {t('matches.floorWaitingArchiveOther')}
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
        className={matchCardDepartClass(
          `rounded-2xl p-4 flex items-center gap-3 transition-shadow animate-fadeIn cursor-pointer match-card-declined${
            pulseSingleId === card.profile.id ? ' match-card-attention-pulse' : ''
          }`,
          isDeparting(card.profile.id)
        )}
        onClick={() => {
          consumeAttentionPulse(card.profile.id);
          setOpenPendingDeclined(card);
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
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

        <MatchCardActions>
          <ArchiveButton
            name={card.profile.display_name}
            busy={busy}
            tooltip={cardActionTooltip(0, 2)}
            onClick={() => void handlePendingDeclined(card, true)}
          />
          <RefuseButton
            name={card.profile.display_name}
            busy={busy}
            label={t('common.delete')}
            tooltip={cardActionTooltip(1, 2)}
            onClick={() => void handlePendingDeclined(card, false)}
          />
        </MatchCardActions>
      </div>
      </div>
    );
  };

  const renderPendingDeclinedFloor = () => {
    if (pendingDeclined.length === 0) return null;
    return (
      <section className="space-y-2" aria-label={t('matches.floorDeclined')}>
        <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 tracking-wide">
          <span className="match-intro-chip match-chip-declined">
            {t('matches.floorDeclined')}
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
        className={matchCardDepartClass(
          `rounded-2xl p-4 flex items-center gap-3 transition-shadow animate-fadeIn cursor-pointer match-card-declined-archive${
            pulseSingleId === card.profile.id ? ' match-card-attention-pulse' : ''
          }`,
          isDeparting(card.profile.id)
        )}
        onClick={() => {
          consumeAttentionPulse(card.profile.id);
          setOpenArchive(card);
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
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

        <MatchCardActions>
          <RefuseButton
            name={card.profile.display_name}
            busy={declinedBusyId === card.archiveId}
            label={t('common.delete')}
            tooltip={cardActionTooltip(0, 1)}
            onClick={() => void handleDeleteArchived(card)}
          />
        </MatchCardActions>
      </div>
      </div>
    );
  };

  const renderDeclinedArchiveFloor = () => {
    if (declinedArchives.length === 0) return null;
    return (
      <section className="space-y-2" aria-label={t('matches.floorDeclinedArchives')}>
        <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 tracking-wide">
          <span className="match-intro-chip match-chip-declined-archive">
            {t('matches.floorDeclinedArchives')}
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
        className={matchCardDepartClass(
          `rounded-2xl p-4 flex items-center gap-3 transition-shadow animate-fadeIn cursor-pointer ${
            hadDialogue ? 'match-card-broken-chat' : 'match-card-broken-quiet'
          }`,
          isDeparting(card.profile.id)
        )}
        onClick={() => setOpenBroken(card)}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpenBroken(card);
          }}
          className="match-card-photo relative w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 flex-shrink-0"
          aria-label={`Voir le profil de ${card.profile.display_name}`}
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
                : 'match-broken-origin-badge-quiet'
            }`}
          >
            {brokenMatchOriginLabel(hadDialogue)}
          </p>
        </div>
        <MatchCardActions>
          {card.source === 'mine' ? (
            <RestoreLinkButton
              name={card.profile.display_name}
              busy={busy}
              tooltip={cardActionTooltip(0, 2)}
              onClick={() => void handleBrokenRestore(card)}
            />
          ) : null}
          <RefuseButton
            name={card.profile.display_name}
            busy={busy}
            label={t('common.delete')}
            tooltip={cardActionTooltip(
              card.source === 'mine' ? 1 : 0,
              card.source === 'mine' ? 2 : 1
            )}
            onClick={() => void handleBrokenPurge(card)}
          />
        </MatchCardActions>
      </div>
    );
  };

  const renderBrokenFloor = () => {
    const mineBroken = brokenMatches.filter((c) => c.source === 'mine');
    const theirsBroken = brokenMatches.filter((c) => c.source === 'theirs');
    if (mineBroken.length === 0 && theirsBroken.length === 0) return null;
    return (
      <section className="space-y-6" aria-label={t('matches.floorBrokenYou')}>
        {mineBroken.length > 0 ? (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 tracking-wide">
              <span className="match-intro-chip match-chip-broken">
                {t('matches.floorBrokenYou')}
              </span>
              <span className="text-gray-400 font-normal">
                ({mineBroken.length})
              </span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {mineBroken.map((card) => renderBrokenCard(card))}
            </div>
          </div>
        ) : null}
        {theirsBroken.length > 0 ? (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 tracking-wide">
              <span className="match-intro-chip match-chip-broken-theirs">
                {t('matches.floorBrokenThem')}
              </span>
              <span className="text-gray-400 font-normal">
                ({theirsBroken.length})
              </span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {theirsBroken.map((card) => renderBrokenCard(card))}
            </div>
          </div>
        ) : null}
      </section>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
          <div className="text-gray-400 text-sm">{t('matches.loading')}</div>
        </div>
      </div>
    );
  }

  if (error && matches.length === 0 && declinedArchives.length === 0 && pendingDeclined.length === 0 && waitArchives.length === 0 && pendingWaiting.length === 0 && waitingByOthers.length === 0 && brokenMatches.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 text-red-700 text-sm max-w-md">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (matches.length === 0 && declinedArchives.length === 0 && pendingDeclined.length === 0 && waitArchives.length === 0 && pendingWaiting.length === 0 && waitingByOthers.length === 0 && brokenMatches.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-50 to-amber-50 flex items-center justify-center">
            <Heart className="w-9 h-9 text-rose-300 match-empty-heart" />
          </div>
          <h2
            className="text-xl font-bold text-blue-900 my-4"
            aria-label={t('matches.emptyTitle')}
          >
            {Array.from(t('matches.emptyTitle')).map((char, i, chars) => (
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
            {t('matches.emptyBody')}
          </p>
          <p className="text-gray-500 max-w-md mt-2 font-normal italic">
            {t('matches.emptyHint')}
          </p>
        </div>
        <SoftPremiumBanner
          title={t('matches.unlimitedMessagesTitle')}
          description={t('matches.unlimitedMessagesBody', {
            offer: offerLabel(status),
          })}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {chatPeer && (
        <ChatScreen
          peer={chatPeer}
          onDialogueStarted={(peerId) => {
            twoWayDialogueRef.current.add(peerId);
            setPeersWithChat((prev) => {
              if (prev.has(peerId)) return prev;
              const next = new Set(prev);
              next.add(peerId);
              return next;
            });
            interactWithMatchCard(peerId);
          }}
          onClose={() => {
            interactWithMatchCard(chatPeer.id);
            setChatPeer(null);
            void loadMatches();
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
        {t('matches.title')} (
        {matches.filter((m) => !brokenPeerIds.has(m.profile.id)).length})
      </h2>
      <MatchesGlossary
        openIntroSection={openIntroSection}
        onToggle={toggleIntroSection}
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Étages : Pendant → Avant → Après (même découpage que le glossaire) */}
      <div className="space-y-8">
        {hasPendantStage ? (
          <MatchStageBlock label={t('matches.glossaryPendant')}>
            {renderFloor(
              'matched-chat',
              t('matches.chipDiscussionCap'),
              floors.matchedChat
            )}
            {renderFloor(
              'matched-quiet',
              t('matches.chipFirstWord'),
              floors.matchedQuiet
            )}
          </MatchStageBlock>
        ) : null}
        {hasAvantStage ? (
          <MatchStageBlock label={t('matches.glossaryAvant')}>
            {renderWaitFloor()}
            {renderFloor('new', t('matches.floorToStudy'), floors.new)}
            {renderPendingDeclinedFloor()}
            {renderDeclinedArchiveFloor()}
          </MatchStageBlock>
        ) : null}
        {hasApresStage ? (
          <MatchStageBlock label={t('matches.glossaryApres')}>
            {renderBrokenFloor()}
          </MatchStageBlock>
        ) : null}
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
          pendingDecision={
            actingId === openProfile.profile.id ? actingDecision : null
          }
          likesExhausted={likesExhausted}
          showFlashCta={false}
          inboxHistory={{
            origin: openProfile.origin,
            originLabel: originHistoryLabel(
              openProfile.origin,
              originHistoryIso({
                matchRole: openProfile.matchRole,
                dateReceived: openProfile.date_received,
                matchedAt: openProfile.matched_at,
                matchedBackAt: openProfile.matchedBackAt,
              })
            ),
            matchedLabel:
              openProfile.kind === 'match' || openProfile.alreadyLiked
                ? matchedHistoryLabel(
                    firstWordEventIso({
                      matchRole: openProfile.matchRole,
                      dateReceived: openProfile.date_received,
                      matchedAt: openProfile.matched_at,
                      matchedBackAt: openProfile.matchedBackAt,
                    }),
                    openProfile.matchRole
                  )
                : null,
            matchedViaWait: matchSheetUsesCrown(
              openProfile.kind === 'match' || openProfile.alreadyLiked,
              openProfile.matchedViaWait
            ),
            waiting: openProfile.waiting,
            refused: openProfile.refused,
            viewerGender: myGender,
          }}
          unreadCount={unread.bySender[openProfile.profile.id] || 0}
          onClose={() => {
            interactWithMatchCard(openProfile.profile.id);
            setOpenProfile(null);
          }}
          onLike={() => void handleMatchBack(openProfile)}
          onFlash={() => undefined}
          onSkip={() => {
            interactWithMatchCard(openProfile.profile.id);
            setOpenProfile(null);
          }}
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
                ? () => {
                    if (waitingDeleteUi('profile-sheet') !== 'purge') return;
                    void handlePurgeWaiting(openProfile);
                  }
                : undefined
          }
          onOpenChat={
            openProfile.kind === 'match' ||
            openProfile.alreadyLiked ||
            (unread.bySender[openProfile.profile.id] || 0) > 0
              ? () => {
                  interactWithMatchCard(openProfile.profile.id);
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
          onPurgeLink={() => void handleDeleteArchived(openArchive)}
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

      {openWaitingByOther && (
        <ProfileDetailModal
          candidate={{
            id: openWaitingByOther.profile.id,
            display_name: openWaitingByOther.profile.display_name,
            photo_url: openWaitingByOther.profile.photo_url,
            age: openWaitingByOther.age,
            bio: openWaitingByOther.profile.bio,
            location: openWaitingByOther.profile.location,
            interests: openWaitingByOther.profile.interests,
            is_boosted: openWaitingByOther.is_boosted,
            is_founder: openWaitingByOther.is_founder,
            founder_number: openWaitingByOther.founder_number,
          }}
          alreadyFlashed
          alreadyLiked
          busy={false}
          likesExhausted={false}
          showFlashCta={false}
          inboxHistory={{
            origin: openWaitingByOther.origin,
            originLabel: originHistoryLabel(
              openWaitingByOther.origin,
              openWaitingByOther.createdAt
            ),
            waitingIncoming: true,
            refused: false,
            viewerGender: myGender,
          }}
          onClose={() => setOpenWaitingByOther(null)}
          onLike={() => undefined}
          onFlash={() => undefined}
          onSkip={() => setOpenWaitingByOther(null)}
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
          onRestoreLink={
            openWaitArchive.source === 'mine'
              ? () => void handleRestoreWaitArchive(openWaitArchive)
              : undefined
          }
          onPurgeLink={() => void handleDeleteWaitArchive(openWaitArchive)}
        />
      )}

      {openBroken && (
        <ProfileDetailModal
          candidate={{
            id: openBroken.profile.id,
            display_name: openBroken.profile.display_name,
            photo_url: openBroken.profile.photo_url,
            age: openBroken.age,
            bio: openBroken.profile.bio,
            location: openBroken.profile.location,
            interests: openBroken.profile.interests,
            is_boosted: openBroken.is_boosted,
            is_founder: openBroken.is_founder,
            founder_number: openBroken.founder_number,
          }}
          alreadyFlashed
          alreadyLiked
          busy={brokenBusyId === openBroken.archiveId}
          likesExhausted={false}
          showFlashCta={false}
          inboxHistory={{
            origin: openBroken.origin,
            originLabel: brokenMatchStatusLabel(
              openBroken.action,
              openBroken.createdAt
            ),
            waiting: false,
            refused: false,
            viewerGender: myGender,
          }}
          onClose={() => setOpenBroken(null)}
          onLike={() => undefined}
          onFlash={() => undefined}
          onSkip={() => setOpenBroken(null)}
          onRestoreLink={
            openBroken.source === 'mine'
              ? () => void handleBrokenRestore(openBroken)
              : undefined
          }
          onPurgeLink={() => void handleBrokenPurge(openBroken)}
        />
      )}

      {openWaitingManage && (
        <MatchManageModal
          peer={openWaitingManage.profile}
          mode="waiting"
          origin={openWaitingManage.origin}
          busy={actingId === openWaitingManage.profile.id}
          error={null}
          onClose={() => {
            if (waitingManageServerMutation('manage-dismiss') !== 'none') {
              return;
            }
            setOpenWaitingManage(null);
          }}
          onArchive={() => void handleArchiveWaiting(openWaitingManage)}
          onPurge={() => void handlePurgeWaiting(openWaitingManage)}
        />
      )}
    </div>
  );
}
