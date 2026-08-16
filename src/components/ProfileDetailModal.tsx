import { Check, Heart, MapPin, MessageCircle, X, Zap } from 'lucide-react';
import { createPortal } from 'react-dom';
import { BoostedBadge, FounderBadge } from '@/components/membership/Badges';
import { geoProximityBadge } from '@/lib/geoProximity';
import { unreadMessagesLabel } from '@/components/UnreadBadge';
import {
  matchWaitingNotification,
  waitingMatchReminder,
} from '@/lib/interactionCopy';
import MatcherWord from '@/components/MatcherWord';
import type { InboxDecision } from '@/lib/inboxResponses';
import type { ProfileGender } from '@/components/ProfileSetup';

export type ProfileDetailCandidate = {
  id: string;
  display_name: string;
  photo_url: string;
  age: number;
  bio?: string | null;
  location?: string | null;
  interests?: string[];
  mutual_interests?: string[];
  same_city?: boolean;
  same_department?: boolean;
  same_region?: boolean;
  neighboring_region?: boolean;
  is_boosted?: boolean;
  is_founder?: boolean;
  founder_number?: number | null;
};

export type InboxHistory = {
  origin: 'flash' | 'like';
  originLabel: string;
  matchedLabel?: string | null;
  waiting?: boolean;
  waitingIncoming?: boolean;
  refused?: boolean;
  declinedByThem?: boolean;
  declinedByThemLabel?: string | null;
  viewerGender?: ProfileGender | null;
};

export default function ProfileDetailModal({
  candidate,
  alreadyFlashed,
  alreadyLiked,
  busy,
  likesExhausted,
  showFlashCta,
  inboxHistory,
  unreadCount = 0,
  onClose,
  onLike,
  onFlash,
  onSkip,
  onOpenChat,
  onInboxDecision,
  onDeclinedArchive,
  onDeclinedDelete,
  onWaitingArchive,
  onWaitingDiscard,
}: {
  candidate: ProfileDetailCandidate;
  alreadyFlashed: boolean;
  alreadyLiked: boolean;
  busy: boolean;
  likesExhausted: boolean;
  showFlashCta: boolean;
  inboxHistory?: InboxHistory;
  unreadCount?: number;
  onClose: () => void;
  onLike: () => void;
  onFlash: () => void;
  onSkip: () => void;
  onOpenChat?: () => void;
  onInboxDecision?: (decision: InboxDecision) => void;
  onDeclinedArchive?: () => void;
  onDeclinedDelete?: () => void;
  onWaitingArchive?: () => void;
  onWaitingDiscard?: () => void;
}) {
  const interests = candidate.interests || [];
  const mutual = new Set(candidate.mutual_interests || []);
  const geoBadge = geoProximityBadge(candidate);
  const pendingInbox =
    Boolean(inboxHistory) &&
    !alreadyLiked &&
    !inboxHistory?.matchedLabel &&
    !inboxHistory?.refused &&
    !inboxHistory?.declinedByThem;
  const showInboxActions = pendingInbox && Boolean(onInboxDecision);
  const waitingLocked = Boolean(inboxHistory?.waiting) && showInboxActions;
  const waitingIncomingSheet = Boolean(inboxHistory?.waitingIncoming);
  const showWaitingSheetActions = waitingLocked || waitingIncomingSheet;

  const fireDeclined = (
    event: { preventDefault: () => void; stopPropagation: () => void },
    action?: () => void
  ) => {
    event.preventDefault();
    event.stopPropagation();
    action?.();
  };

  const modal = (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-detail-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] cursor-pointer"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rose-100 max-h-[92vh] overflow-y-auto animate-fadeIn">
        <div className="aspect-[4/5] sm:aspect-[5/4] bg-gradient-to-br from-rose-100 to-amber-100 relative">
          {candidate.photo_url ? (
            <img
              src={candidate.photo_url}
              alt={candidate.display_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-5xl font-bold text-white/80">
              {candidate.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/90 shadow-sm border border-white/80 flex items-center justify-center hover:bg-gray-100 cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-4 h-4 text-gray-500 pointer-events-none" />
          </button>
          <span className="absolute bottom-3 right-3 px-2.5 py-0.5 rounded-full bg-black/45 text-white text-xs font-semibold backdrop-blur-sm pointer-events-none">
            {candidate.age} ans
          </span>
          {unreadCount > 0 && (
            <span className="absolute top-3 left-3 min-w-[1.35rem] h-[1.35rem] px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center unread-badge-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                id="profile-detail-title"
                className="text-xl font-bold text-gray-900"
              >
                {candidate.display_name}
              </h2>
              {candidate.is_boosted && <BoostedBadge size="sm" />}
              {candidate.is_founder && (
                <FounderBadge number={candidate.founder_number} size="sm" />
              )}
            </div>
            {candidate.location && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5" />
                {candidate.location}
                {geoBadge ? (
                  <span className="text-gray-400">· {geoBadge}</span>
                ) : null}
              </p>
            )}
          </div>

          {candidate.bio ? (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {candidate.bio}
            </p>
          ) : null}

          {interests.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Centres d’intérêt
              </p>
              <div className="flex flex-wrap gap-1.5">
                {interests.map((interest) => {
                  const shared = mutual.has(interest);
                  return (
                    <span
                      key={interest}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        shared
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {shared ? '✦ ' : ''}
                      {interest}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {unreadCount > 0 && onOpenChat ? (
            <button
              type="button"
              onClick={onOpenChat}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              {unreadMessagesLabel(unreadCount)} — ouvrir
            </button>
          ) : null}

          {inboxHistory ? (
            <div
              className={`rounded-2xl px-4 py-3 space-y-2 ${
                inboxHistory.origin === 'flash'
                  ? 'bg-amber-50/80 border border-amber-100'
                  : 'bg-rose-50/80 border border-rose-100'
              }`}
            >
              <p
                className={`text-sm font-medium flex items-center gap-2 ${
                  inboxHistory.origin === 'flash'
                    ? 'text-amber-800'
                    : 'text-rose-700'
                }`}
              >
                {inboxHistory.origin === 'flash' ? (
                  <Zap className="w-4 h-4 shrink-0" fill="currentColor" />
                ) : (
                  <Heart className="w-4 h-4 shrink-0" fill="currentColor" />
                )}
                {inboxHistory.originLabel}
              </p>
              {inboxHistory.matchedLabel ? (
                <p className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" strokeWidth={2.5} />
                  {inboxHistory.matchedLabel}
                </p>
              ) : null}
              {inboxHistory.refused ? (
                <p className="text-sm text-gray-600">
                  Tu as décliné ce profil.
                </p>
              ) : null}
              {inboxHistory.declinedByThem ? (
                <p className="text-sm text-purple-800">
                  {inboxHistory.declinedByThemLabel ||
                    'A décliné ton Like ou Flash'}
                </p>
              ) : null}
              {inboxHistory.declinedByThem &&
              (onDeclinedArchive || onDeclinedDelete) ? (
                <div className="grid grid-cols-2 gap-2 pt-1 relative z-20 pointer-events-auto">
                  {onDeclinedDelete ? (
                    <button
                      type="button"
                      disabled={busy}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => fireDeclined(e, onDeclinedDelete)}
                      className="py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
                    >
                      {busy ? '…' : 'Supprimer'}
                    </button>
                  ) : null}
                  {onDeclinedArchive ? (
                    <button
                      type="button"
                      disabled={busy}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => fireDeclined(e, onDeclinedArchive)}
                      className="py-2.5 rounded-xl bg-purple-700 text-white text-sm font-semibold hover:bg-purple-800 disabled:opacity-40 cursor-pointer"
                    >
                      {busy ? '…' : 'Archiver'}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {inboxHistory.waitingIncoming ? (
                <p className="text-sm text-amber-900/90 leading-relaxed">
                  {matchWaitingNotification(
                    candidate.display_name,
                    inboxHistory.origin
                  ).body}
                </p>
              ) : inboxHistory.waiting && !inboxHistory.matchedLabel ? (
                <p className="text-sm text-amber-900/90 leading-relaxed">
                  {waitingMatchReminder(
                    inboxHistory.origin,
                    inboxHistory.viewerGender
                  )}
                </p>
              ) : null}
              {inboxHistory.matchedLabel && onOpenChat && unreadCount <= 0 ? (
                <button
                  type="button"
                  onClick={onOpenChat}
                  className="w-full mt-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Ouvrir la conversation
                </button>
              ) : null}

              {showWaitingSheetActions ? (
                <div className="grid grid-cols-2 gap-2 pt-1 relative z-20 pointer-events-auto">
                  <button
                    type="button"
                    disabled={busy}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) =>
                      fireDeclined(e, () => {
                        if (onWaitingDiscard) onWaitingDiscard();
                        else onInboxDecision?.('refuse');
                      })
                    }
                    className="py-2.5 px-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 leading-tight cursor-pointer"
                  >
                    {busy ? '…' : 'Jeter'}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !onWaitingArchive}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => fireDeclined(e, onWaitingArchive)}
                    className="py-2.5 px-2 rounded-xl bg-amber-400 text-amber-950 text-sm font-semibold hover:bg-amber-300 disabled:opacity-40 cursor-pointer"
                  >
                    {busy ? '…' : 'Archiver'}
                  </button>
                </div>
              ) : showInboxActions ? (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onInboxDecision?.('refuse')}
                    className="py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Refuser
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onInboxDecision?.('wait')}
                    className="py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-40"
                  >
                    Attendre
                  </button>
                  <button
                    type="button"
                    disabled={busy || likesExhausted}
                    onClick={() => onInboxDecision?.('match')}
                    className="py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-40"
                  >
                    <MatcherWord />
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-4 pt-2 overflow-visible">
              <button
                type="button"
                onClick={onSkip}
                className="box-border inline-flex size-12 min-w-12 min-h-12 p-0 shrink-0 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50 cursor-pointer"
                title="Masquer"
                aria-label={`Masquer ${candidate.display_name}`}
              >
                <X className="size-5 shrink-0 text-gray-400 pointer-events-none" />
              </button>
              {showFlashCta && (
                <button
                  type="button"
                  onClick={onFlash}
                  disabled={busy || alreadyFlashed}
                  className="box-border inline-flex size-12 min-w-12 min-h-12 p-0 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-rose-500 shadow-sm overflow-hidden hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
                  title={
                    alreadyFlashed ? 'Déjà flashé' : 'Envoyer un flash'
                  }
                  aria-label={
                    alreadyFlashed
                      ? `Déjà flashé ${candidate.display_name}`
                      : `Flasher ${candidate.display_name}`
                  }
                >
                  <Zap
                    className="size-5 shrink-0 text-white pointer-events-none"
                    fill="white"
                    strokeWidth={2}
                  />
                </button>
              )}
              <button
                type="button"
                onClick={onLike}
                disabled={busy || likesExhausted || alreadyLiked}
                className="box-border inline-flex size-12 min-w-12 min-h-12 p-0 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-500 shadow-sm overflow-hidden hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
                title={
                  alreadyLiked
                    ? 'Déjà liké'
                    : likesExhausted
                      ? 'Limite de likes atteinte'
                      : 'Liker ce profil'
                }
                aria-label={
                  alreadyLiked
                    ? `Déjà liké ${candidate.display_name}`
                    : `Liker ${candidate.display_name}`
                }
              >
                <Heart
                  className="size-5 shrink-0 text-white pointer-events-none"
                  fill="white"
                  strokeWidth={2}
                />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
}
