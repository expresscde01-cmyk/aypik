import { Check, Heart, MapPin, MessageCircle, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FounderBadge } from '@/components/membership/Badges';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import ProfilePhoto from '@/components/ProfilePhoto';
import { CardGeoFacts } from '@/components/GeoBadgeLine';
import type { GeoPerimeterFilter } from '@/lib/geoProximity';
import { unreadMessagesLabel } from '@/components/UnreadBadge';
import {
  LIKE_NOTIFICATION_EMOJI,
  matchWaitingNotification,
  refusedInboxFollowup,
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
  distance_km?: number | null;
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
  geoPerimeter,
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
  onRestoreLink,
  onPurgeLink,
}: {
  candidate: ProfileDetailCandidate;
  geoPerimeter?: GeoPerimeterFilter | null;
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
  onRestoreLink?: () => void;
  onPurgeLink?: () => void;
}) {
  const interests = candidate.interests || [];
  const mutual = new Set(candidate.mutual_interests || []);
  const pendingInbox =
    Boolean(inboxHistory) &&
    !alreadyLiked &&
    !inboxHistory?.matchedLabel &&
    !inboxHistory?.refused &&
    !inboxHistory?.declinedByThem;
  const showInboxActions = pendingInbox && Boolean(onInboxDecision);
  const waitingLocked = Boolean(inboxHistory?.waiting) && showInboxActions;
  const waitingIncomingSheet = Boolean(inboxHistory?.waitingIncoming);
  const showRefusedSheetActions =
    Boolean(inboxHistory?.refused) &&
    (Boolean(onWaitingArchive) || Boolean(onWaitingDiscard));
  const showWaitingSheetActions =
    !showRefusedSheetActions &&
    (waitingLocked ||
      (waitingIncomingSheet &&
        (Boolean(onWaitingArchive) || Boolean(onWaitingDiscard))));
  const showArchiveLinkActions =
    Boolean(onRestoreLink) || Boolean(onPurgeLink);

  const [confirmDelete, setConfirmDelete] = useState<(() => void) | null>(
    null
  );

  const fireDeclined = (
    event: { preventDefault: () => void; stopPropagation: () => void },
    action?: () => void
  ) => {
    event.preventDefault();
    event.stopPropagation();
    action?.();
  };

  const requestDelete = (
    event: { preventDefault: () => void; stopPropagation: () => void },
    action?: () => void
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!action) return;
    setConfirmDelete(() => action);
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
            <ProfilePhoto
              src={candidate.photo_url}
              alt={candidate.display_name}
              eager
              width={640}
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
            <div>
              <h2
                id="profile-detail-title"
                className="text-xl font-bold text-gray-900"
              >
                {candidate.display_name}
              </h2>
              {candidate.is_founder ? (
                <div className="mt-1">
                  <FounderBadge number={candidate.founder_number} size="sm" />
                </div>
              ) : null}
            </div>
            {candidate.location && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5" />
                {candidate.location}
              </p>
            )}
            <div className="mt-1">
              <CardGeoFacts
                flags={candidate}
                location={candidate.location}
                perimeter={geoPerimeter}
                distanceKm={candidate.distance_km}
              />
            </div>
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
              className="btn-open-conversation w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
            >
              <MessageCircle className="w-4 h-4" />
              {unreadMessagesLabel(unreadCount)} — ouvrir
            </button>
          ) : null}

          {inboxHistory ? (
            <>
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
                  {showRefusedSheetActions
                    ? refusedInboxFollowup(inboxHistory.origin)
                    : 'Tu as décliné ce profil.'}
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
                <div className="flex flex-col gap-2 pt-1 relative z-20 pointer-events-auto">
                  {onDeclinedArchive ? (
                    <button
                      type="button"
                      disabled={busy}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => fireDeclined(e, onDeclinedArchive)}
                      className="btn-archive w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 cursor-pointer"
                    >
                      {busy ? '…' : 'Archiver'}
                    </button>
                  ) : null}
                  {onDeclinedDelete ? (
                    <button
                      type="button"
                      disabled={busy}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => requestDelete(e, onDeclinedDelete)}
                      className="btn-purge-trigger w-full py-2.5 rounded-xl bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                    >
                      {busy ? '…' : 'Supprimer'}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {inboxHistory.waitingIncoming && !inboxHistory.refused ? (
                <p className="text-sm text-amber-900/90 leading-relaxed">
                  {matchWaitingNotification(
                    candidate.display_name,
                    inboxHistory.origin
                  ).body}
                </p>
              ) : inboxHistory.waiting &&
                !inboxHistory.matchedLabel &&
                !inboxHistory.refused ? (
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
                  className="btn-open-conversation w-full mt-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
                >
                  <MessageCircle className="w-4 h-4" />
                  Ouvrir la conversation
                </button>
              ) : null}

              {showWaitingSheetActions ? (
                <div className="flex flex-col gap-2 pt-1 relative z-20 pointer-events-auto">
                  {waitingLocked ? (
                    <button
                      type="button"
                      disabled={busy || likesExhausted}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onInboxDecision) onInboxDecision('match');
                        else onLike();
                      }}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-40 cursor-pointer"
                    >
                      {busy ? '…' : <MatcherWord />}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || !onWaitingArchive}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => fireDeclined(e, onWaitingArchive)}
                    className="btn-archive w-full py-2.5 px-2 rounded-xl text-sm font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    {busy ? '…' : 'Archiver'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) =>
                      requestDelete(e, () => {
                        if (onWaitingDiscard) onWaitingDiscard();
                        else onInboxDecision?.('refuse');
                      })
                    }
                    className="btn-discard-outline w-full py-2.5 px-2 rounded-xl text-sm font-semibold disabled:opacity-40 leading-tight cursor-pointer bg-white border border-[#dc2626] text-[#dc2626]"
                  >
                    {busy ? '…' : 'Jeter'}
                  </button>
                </div>
              ) : showRefusedSheetActions ? (
                <div className="flex flex-col gap-2 pt-1 relative z-20 pointer-events-auto">
                  <button
                    type="button"
                    disabled={busy || !onWaitingArchive}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => fireDeclined(e, onWaitingArchive)}
                    className="btn-archive w-full py-2.5 px-2 rounded-xl text-sm font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    {busy ? '…' : 'Archiver'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) =>
                      requestDelete(e, () => {
                        if (onWaitingDiscard) onWaitingDiscard();
                        else onInboxDecision?.('refuse');
                      })
                    }
                    className="btn-discard-outline w-full py-2.5 px-2 rounded-xl text-sm font-semibold disabled:opacity-40 leading-tight cursor-pointer bg-white border border-[#dc2626] text-[#dc2626]"
                  >
                    {busy ? '…' : 'Jeter'}
                  </button>
                </div>
              ) : showInboxActions ? (
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy || likesExhausted}
                    onClick={() => onInboxDecision?.('match')}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-40"
                  >
                    <MatcherWord />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onInboxDecision?.('wait')}
                    className="btn-wait w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                  >
                    Attendre
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onInboxDecision?.('refuse')}
                    className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-[#dc2626] hover:bg-gray-50 disabled:opacity-40"
                  >
                    Refuser
                  </button>
                </div>
              ) : null}
            </div>
            {showArchiveLinkActions ? (
              <div className="flex flex-col gap-2 relative z-20 pointer-events-auto">
                {onRestoreLink ? (
                  <button
                    type="button"
                    disabled={busy}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => fireDeclined(e, onRestoreLink)}
                    className="btn-restore-link w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    {busy ? '…' : 'Rétablir le lien'}
                  </button>
                ) : null}
                {onPurgeLink ? (
                  <button
                    type="button"
                    disabled={busy}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => requestDelete(e, onPurgeLink)}
                    className="btn-purge-trigger w-full py-2.5 rounded-xl bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                  >
                    {busy ? '…' : 'Supprimer'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
          ) : (
            <div className="flex items-center justify-center gap-4 pt-2 overflow-visible">
              <button
                type="button"
                onClick={onSkip}
                className="group relative box-border inline-flex size-12 min-w-12 min-h-12 p-0 shrink-0 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50 cursor-pointer overflow-visible"
                aria-label={`Masquer ${candidate.display_name}`}
              >
                <X className="size-5 shrink-0 text-gray-400 pointer-events-none" />
                <span className="pointer-events-none absolute z-30 bottom-full left-1/2 mb-1.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-full border border-gray-100 bg-white/95 px-2 py-0.5 text-[11px] font-medium tracking-wide text-gray-600 shadow-sm opacity-0 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-y-0 group-focus-visible:opacity-100 group-focus-visible:translate-y-0">
                  Masquer
                </span>
              </button>
              {showFlashCta && (
                <button
                  type="button"
                  onClick={onFlash}
                  disabled={busy || alreadyFlashed}
                  className="group relative box-border inline-flex size-12 min-w-12 min-h-12 p-0 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-rose-500 shadow-sm overflow-visible hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
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
                  <span className="profile-action-tooltip pointer-events-none absolute z-30 bottom-full left-1/2 mb-1.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide shadow-sm opacity-0 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-y-0 group-focus-visible:opacity-100 group-focus-visible:translate-y-0">
                    {alreadyFlashed ? 'Déjà flashé' : 'Envoyer un flash ⚡'}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={onLike}
                disabled={busy || likesExhausted || alreadyLiked}
                className="group relative box-border inline-flex size-12 min-w-12 min-h-12 p-0 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-500 shadow-sm overflow-visible hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
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
                <span className="profile-action-tooltip pointer-events-none absolute z-30 bottom-full left-1/2 mb-1.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide shadow-sm opacity-0 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-y-0 group-focus-visible:opacity-100 group-focus-visible:translate-y-0">
                  {alreadyLiked
                    ? 'Déjà liké'
                    : likesExhausted
                      ? 'Limite de likes atteinte'
                      : `Liker ${LIKE_NOTIFICATION_EMOJI} ce profil`}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const tree = (
    <>
      {modal}
      {confirmDelete ? (
        <ConfirmDeleteModal
          busy={busy}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const run = confirmDelete;
            setConfirmDelete(null);
            run();
          }}
        />
      ) : null}
    </>
  );

  if (typeof document === 'undefined') return tree;
  return createPortal(tree, document.body);
}
