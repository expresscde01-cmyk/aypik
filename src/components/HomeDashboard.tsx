import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Compass,
  Heart,
  LogOut,
  MapPin,
  MessageCircle,
  Share2,
  Sparkles,
  User,
} from 'lucide-react';
import AccountMenu from '@/components/AccountMenu';
import { AccountStatusBadges } from '@/components/AccountStatusBadge';
import OwnerBoostIndicator from '@/components/membership/OwnerBoostIndicator';
import { BrandHeaderBrand } from '@/components/BrandLockup';
import MemberGreeting from '@/components/MemberGreeting';
import { FounderBadge, ProfileCardCornerBadges } from '@/components/membership/Badges';
import type { Profile } from '@/components/ProfileSetup';
import NotificationsBell from '@/components/NotificationsBell';
import ProfileDetailModal from '@/components/ProfileDetailModal';
import ProfilePhoto from '@/components/ProfilePhoto';
import { OnlinePresenceDot } from '@/components/OnlinePresenceDot';
import UnreadBadge, { unreadMessagesLabel } from '@/components/UnreadBadge';
import HomeActionShape from '@/components/HomeActionShape';
import { CardGeoFacts, InternationalCardGeoFacts } from '@/components/GeoBadgeLine';
import LanguageSwitcher from '@/i18n/LanguageSwitcher';
import {
  HeaderTaglineWidthProbe,
  MobileTaglineWidthProbe,
  useHeaderTaglineCompact,
  useMobileTaglineFits,
} from '@/lib/useHeaderTaglineCompact';
import {
  fetchSuggestedProfiles,
  HOME_SUGGESTIONS_MAX,
  type SuggestedProfile,
} from '@/lib/suggestions';
import { loadSuggestionPrefs } from '@/lib/suggestionPrefs';
import { effectiveSuggestionPrefs } from '@/lib/offerAccess';
import { isInternationalPerimeter } from '@/lib/geoProximity';
import { formatInternationalGeoFacts } from '@/lib/worldGeo';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { fetchMyProfile } from '@/lib/myProfile';
import { queryKeys } from '@/lib/queryClient';
import {
  fetchLikeFlashEdges,
  invalidateLikeFlashEdges,
  sendLike,
} from '@/lib/likeFlashEdges';
import { useMembership } from '@/lib/useMembership';
import { formatDateFr, isFounderPeriodActive } from '@/lib/membership';
import { useMatchesBoard } from '@/lib/matchesBoard';
import { useLiveMatchCount } from '@/lib/liveMatchCount';
import { countFirstWordMatches } from '@/lib/matchHistoryDisplay';
import { profileCompletionPercent } from '@/lib/profileCompletion';
import { requestDiscoverFilters } from '@/lib/discoverEntry';
import { flashErrorMessage, isFlashCtaVisible, sendFlash } from '@/lib/flashes';
import { userErrorMessage } from '@/lib/userError';
import type { OpenMatchesOpts } from '@/lib/matchesNav';
import {
  accountStatusHomeBanner,
  resolveVisibilityChoice,
  type AccountStatusId,
  type VisibilityChoice,
} from '@/lib/accountStatus';
import { useTranslation } from 'react-i18next';
import type { DiscoverMode } from '@/lib/discoverMode';
import { resolveGreetingNameColor } from '@/lib/greetingNameColor';

type HomeSuggestion = SuggestedProfile & {
  is_founder?: boolean;
  founder_number?: number | null;
};

export default function HomeDashboard({
  displayName,
  greetingNameColor = null,
  gender = null,
  viewerProfile = null,
  onHome,
  onSignOut,
  onOpenDiscover,
  onOpenMatches,
  onOpenProfile,
  onOpenPassword,
  onOpenNotifications,
  unreadBySender = {},
  profileEpoch = 0,
  suggestionPrefsEpoch = 0,
  notificationsActive = true,
  paused = false,
  visibilityUi = null,
  onVisibilityChange,
  accountMenuRequestKey = 0,
  accountStatuses = [],
  onAccountStatusClick,
  discoverMode,
  onDiscoverModeChange,
  acceptsMessagesWithoutMatch = false,
  messagesWithoutMatchNoticeSeen = false,
  onAcceptMessagesWithoutMatch,
  onMessagesWithoutMatchNoticeSeen,
}: {
  displayName: string;
  greetingNameColor?: string | null;
  gender?: string | null;
  viewerProfile?: Profile | null;
  onHome: () => void;
  onSignOut?: () => void;
  onOpenDiscover: () => void;
  onOpenMatches: (actorId?: string | null, opts?: OpenMatchesOpts) => void;
  onOpenProfile: () => void;
  onOpenPassword: () => void;
  onOpenNotifications: () => void;
  unreadBySender?: Record<string, number>;
  profileEpoch?: number;
  /** Incrémenté à chaque sortie de Découvrir : force la relecture des filtres. */
  suggestionPrefsEpoch?: number;
  notificationsActive?: boolean;
  paused?: boolean;
  visibilityUi?: 'deactivated' | 'incognito' | null;
  onVisibilityChange?: (choice: VisibilityChoice) => Promise<string | null>;
  accountMenuRequestKey?: number;
  accountStatuses?: AccountStatusId[];
  onAccountStatusClick?: (id: AccountStatusId) => void;
  discoverMode?: DiscoverMode | null;
  onDiscoverModeChange?: (mode: DiscoverMode) => void;
  acceptsMessagesWithoutMatch?: boolean;
  messagesWithoutMatchNoticeSeen?: boolean;
  onAcceptMessagesWithoutMatch?: (value: boolean) => void;
  onMessagesWithoutMatchNoticeSeen?: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { compact: taglineCompact, rowRef, rightRef, probeRef } =
    useHeaderTaglineCompact();
  const {
    fits: mobileTaglineFits,
    rowRef: mobileTaglineRowRef,
    rightRef: mobileTaglineRightRef,
    probeRef: mobileTaglineProbeRef,
  } = useMobileTaglineFits();
  const [pcHeader, setPcHeader] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setPcHeader(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const {
    status,
    refresh,
    loading: membershipLoading,
    error: membershipError,
  } = useMembership();
  const [hiddenIds, setHiddenIds] = useState(() => new Set<string>());
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openProfile, setOpenProfile] = useState<HomeSuggestion | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const founderActive = isFounderPeriodActive(status);
  const board = useMatchesBoard();
  const completionPercent = useMemo(
    () => profileCompletionPercent(viewerProfile),
    [viewerProfile]
  );
  const liveMatchCount = useLiveMatchCount();
  const firstWordCount = useMemo(() => {
    if (!board.loaded) return null;
    return countFirstWordMatches(board.matches, board.peersWithChat);
  }, [board.loaded, board.matches, board.peersWithChat]);
  const founderKnown = !membershipLoading && !membershipError;
  const premiumUntilTime = status.founder_premium_until
    ? new Date(status.founder_premium_until).getTime()
    : Number.NaN;
  const premiumUntilLabel =
    founderKnown &&
    Number.isFinite(premiumUntilTime) &&
    premiumUntilTime > Date.now()
      ? formatDateFr(status.founder_premium_until)
      : '';
  const showFounderBadge = founderKnown && status.is_founder;
  const showProfileStat = completionPercent !== null;
  const showMatchesStat = firstWordCount !== null;
  const showPremiumUntil = premiumUntilLabel.length > 0;
  const statCount =
    Number(showProfileStat) + Number(showMatchesStat) + Number(showPremiumUntil);
  const showCompleteAction =
    completionPercent !== null && completionPercent < 100;
  const photoUrl = viewerProfile?.photo_url?.trim() || '';
  const avatarInitial = displayName.trim().charAt(0).toUpperCase();
  const likesUnlimited = status.unlimited_likes || founderActive;
  const likesExhausted =
    !likesUnlimited && (status.likes_remaining_today ?? 0) <= 0;
  const showFlashCta = isFlashCtaVisible(status);
  const geoPerimeter = useMemo(
    () => (user?.id ? loadSuggestionPrefs(user.id).geoPerimeter : undefined),
    [user?.id, suggestionPrefsEpoch]
  );

  const homeQuery = useQuery({
    queryKey: queryKeys.homeSuggestions(
      user?.id,
      suggestionPrefsEpoch,
      profileEpoch,
      status.plan
    ),
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data: meProfile } = await fetchMyProfile();
      const prefs = effectiveSuggestionPrefs(
        status,
        loadSuggestionPrefs(user!.id),
        meProfile?.location
      );
      const list = await fetchSuggestedProfiles({
        limit: HOME_SUGGESTIONS_MAX,
        myInterests: (meProfile?.interests || []) as string[],
        myAge:
          typeof meProfile?.age === 'number' && Number.isFinite(meProfile.age)
            ? meProfile.age
            : undefined,
        myLocation: meProfile?.location || '',
        myLat: meProfile?.lat,
        myLng: meProfile?.lng,
        viewerGender:
          meProfile?.gender === 'homme' || meProfile?.gender === 'femme'
            ? meProfile.gender
            : null,
        prefs,
      });

      return { list: list as HomeSuggestion[] };
    },
  });

  const edgesQuery = useQuery({
    queryKey: queryKeys.likeFlashEdges(user?.id || ''),
    enabled: Boolean(user?.id),
    queryFn: () => fetchLikeFlashEdges(user!.id),
  });

  useEffect(() => {
    if (!edgesQuery.data) return;
    setLikedIds(new Set(edgesQuery.data.sentLikes.map((l) => l.to_user)));
    setFlashedIds(new Set(edgesQuery.data.sentFlashes.map((f) => f.to_user)));
  }, [edgesQuery.data]);

  const suggestions = useMemo(
    () =>
      (homeQuery.data?.list || []).filter((p) => !hiddenIds.has(p.id)),
    [homeQuery.data, hiddenIds]
  );
  const loading = homeQuery.isLoading || edgesQuery.isLoading;
  const error =
    actionError ||
    (homeQuery.error
      ? homeQuery.error instanceof Error
        ? homeQuery.error.message
        : t('discover.loadSuggestionsError')
      : null);

  useEffect(() => {
    if (!openProfile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenProfile(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openProfile]);

  const handleLike = useCallback(
    async (candidate: HomeSuggestion) => {
      if (!user || actingId || likesExhausted || likedIds.has(candidate.id))
        return;

      setActingId(candidate.id);
        setActionError(null);

      try {
        const { error: likeErr } = await sendLike(candidate.id);
        if (likeErr) throw likeErr;
        setLikedIds((prev) => new Set(prev).add(candidate.id));
        setOpenProfile((open) => (open?.id === candidate.id ? null : open));
        setHiddenIds((prev) => new Set(prev).add(candidate.id));

        const { data: reverse } = await supabase
          .from('likes')
          .select('id')
          .eq('from_user', candidate.id)
          .eq('to_user', user.id)
          .maybeSingle();

        if (reverse) {
          setToast(t('discover.matchToast', { name: candidate.display_name }));
          window.setTimeout(() => setToast(null), 2800);
        }

        invalidateLikeFlashEdges(user.id);
        await refresh();
      } catch (err) {
        setActionError(userErrorMessage(err, t('common.errorOccurred')));
      } finally {
        setActingId(null);
      }
    },
    [user, actingId, likesExhausted, likedIds, refresh]
  );

  const openWiderZone = useCallback(() => {
    requestDiscoverFilters();
    onOpenDiscover();
  }, [onOpenDiscover]);

  const shareSite = useCallback(async () => {
    const url = `${window.location.origin}/`;
    const mobile = window.matchMedia('(max-width: 639px)').matches;
    if (mobile && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Aypik', url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setToast(t('discover.homeLinkCopied'));
      window.setTimeout(() => setToast(null), 2200);
    } catch {
      setActionError(t('common.errorOccurred'));
    }
  }, [t]);

  const handleSkip = useCallback((id: string) => {
    setHiddenIds((prev) => new Set(prev).add(id));
    setOpenProfile((open) => (open?.id === id ? null : open));
  }, []);

  const handleFlash = useCallback(
    async (candidate: HomeSuggestion) => {
      if (!user || actingId || flashedIds.has(candidate.id) || !showFlashCta)
        return;

      setActingId(candidate.id);
        setActionError(null);

      try {
        const result = await sendFlash(candidate.id);

        if (!result.ok) {
          setActionError(flashErrorMessage(result.error, status));
          return;
        }

        setFlashedIds((prev) => new Set(prev).add(candidate.id));
        setToast(
          result.already_flashed
            ? t('discover.alreadyFlashed')
            : result.matched
              ? t('discover.matchToast', { name: candidate.display_name })
              : t('discover.flashSent', { name: candidate.display_name })
        );

        window.setTimeout(() => setToast(null), 2800);
        invalidateLikeFlashEdges(user.id);
      } catch {
        setActionError(t('discover.flashFail'));
      } finally {
        setActingId(null);
      }
    },
    [user, actingId, flashedIds, status, showFlashCta]
  );

  const accountMenu =
    onSignOut && user?.id ? (
      <AccountMenu
        displayName={displayName}
        visibilityChoice={resolveVisibilityChoice({
          paused,
          deactivated: !paused && visibilityUi === 'deactivated',
          incognito: !paused && visibilityUi === 'incognito',
        })}
        onVisibilityChange={onVisibilityChange ?? (async () => null)}
        openRequestKey={accountMenuRequestKey}
        onOpenProfile={onOpenProfile}
        onOpenPassword={onOpenPassword}
        onOpenNotifications={onOpenNotifications}
        onSignOut={onSignOut}
        discoverMode={discoverMode}
        onDiscoverModeChange={onDiscoverModeChange}
        acceptsMessagesWithoutMatch={acceptsMessagesWithoutMatch}
        messagesWithoutMatchNoticeSeen={messagesWithoutMatchNoticeSeen}
        onAcceptMessagesWithoutMatch={onAcceptMessagesWithoutMatch}
        onMessagesWithoutMatchNoticeSeen={onMessagesWithoutMatchNoticeSeen}
      />
    ) : (
      <span className="hidden sm:inline-flex items-center gap-1.5 max-w-[9rem] truncate text-sm font-semibold text-gray-800 ml-1">
        {displayName}
      </span>
    );

  return (
    <div className="min-h-full flex flex-col flex-1 bg-[#FFF8F6]">
      <header className="sticky top-0 z-40 isolate overflow-x-clip bg-white/85 backdrop-blur-md border-b border-aypik-border/80">
        {pcHeader ? (
        <div className="w-full px-8">
          <div className="max-w-7xl mx-auto">
            <div
              ref={rowRef}
              className="relative flex w-full items-center justify-between gap-3 h-14"
            >
              <button
                type="button"
                onClick={onHome}
                className="inline-flex flex-nowrap items-center min-w-0 max-w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-aypik-navy/40 focus-visible:ring-offset-2"
                aria-label={t('common.homeTopAria')}
              >
                <BrandHeaderBrand compact={taglineCompact} />
              </button>
              <div
                ref={rightRef}
                className="flex items-center gap-1 shrink-0 ml-auto"
              >
                <LanguageSwitcher compact />
                <NotificationsBell
                  onOpenInbox={onOpenMatches}
                  active={notificationsActive}
                  discoverMode={discoverMode}
                />
                {accountMenu}
                <OwnerBoostIndicator />
                <AccountStatusBadges
                  statuses={accountStatuses}
                  onSelect={onAccountStatusClick}
                />
                {onSignOut && (
                  <>
                    <span
                      className="hidden lg:block w-px h-4 bg-gray-200 mx-1.5 shrink-0"
                      aria-hidden
                    />
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="hidden lg:inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors whitespace-nowrap shrink-0"
                    >
                      <LogOut className="w-4 h-4" aria-hidden />
                      {t('common.signOutShort')}
                    </button>
                  </>
                )}
              </div>
              <HeaderTaglineWidthProbe probeRef={probeRef} />
            </div>
          </div>
        </div>
        ) : (
        <div className="max-w-2xl mx-auto px-4">
          <div
            ref={mobileTaglineRowRef}
            className="relative flex items-center justify-between gap-2 sm:gap-3 pt-2.5 pb-2.5 sm:h-14 sm:py-0 overflow-x-clip"
          >
            <button
              type="button"
              onClick={onHome}
              className="inline-flex flex-nowrap items-center min-w-0 max-w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-aypik-navy/40 focus-visible:ring-offset-2"
              aria-label={t('common.homeTopAria')}
            >
              <BrandHeaderBrand hideTagline={!mobileTaglineFits} />
            </button>
            <div
              ref={mobileTaglineRightRef}
              className="flex items-center gap-1 shrink-0"
            >
              <LanguageSwitcher compact />
              <NotificationsBell
                onOpenInbox={onOpenMatches}
                active={notificationsActive}
                discoverMode={discoverMode}
              />
              {accountMenu}
              <OwnerBoostIndicator iconOnlyOnMobile />
              <AccountStatusBadges
                statuses={accountStatuses}
                onSelect={onAccountStatusClick}
              />
            </div>
            <MobileTaglineWidthProbe probeRef={mobileTaglineProbeRef} />
          </div>
        </div>
        )}
      </header>

      <div className="member-home-stage">
        <section className="member-home-banner animate-fadeIn">
          <div className="member-home-banner-frame">
            <div className="member-home-banner-main">
          <div className="member-home-banner-top">
            <div className="member-home-avatar">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt=""
                  className="member-home-avatar-photo"
                />
              ) : (
                <span className="member-home-avatar-initial" aria-hidden>
                  {avatarInitial}
                </span>
              )}
              <img
                src="/aypik-coeur.svg"
                alt=""
                className="member-home-avatar-heart"
              />
            </div>
            <div className="member-home-banner-copy">
              <div className="member-home-banner-lead">
                <MemberGreeting
                  as="h1"
                  name={displayName}
                  color={resolveGreetingNameColor(greetingNameColor, gender)}
                  className="member-home-hello text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight"
                />
                <p className="member-home-banner-intro">{t('discover.homeIntro')}</p>
              </div>
              {showFounderBadge && (
                <FounderBadge number={status.founder_number} />
              )}
              {accountStatuses[0] && (
                <p className={accountStatusHomeBanner(accountStatuses[0]).className}>
                  {accountStatusHomeBanner(accountStatuses[0]).text}
                </p>
              )}
          <div className="member-home-banner-actions">
            <button
              type="button"
              onClick={onOpenDiscover}
              className="member-home-action btn-primary"
            >
              <HomeActionShape tone="discover" />
              <span className="member-home-action-inner">
                <Compass aria-hidden="true" />
                {t('common.nav.discover')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onOpenMatches()}
              className="member-home-action btn-secondary"
            >
              <HomeActionShape tone="matches" />
              <span className="member-home-action-inner">
                <Heart aria-hidden="true" />
                {t('matches.title')}
              </span>
              {liveMatchCount > 0 && (
                <UnreadBadge
                  count={liveMatchCount}
                  className="member-home-action-count"
                />
              )}
            </button>
          </div>
            </div>
          </div>
            </div>
          {statCount > 0 && (
            <div
              className={
                statCount === 1
                  ? 'member-home-stats member-home-stats--count-1'
                  : statCount === 2
                    ? 'member-home-stats member-home-stats--count-2'
                    : 'member-home-stats'
              }
            >
              {showProfileStat && (
                <div className="member-home-stat">
                  <p className="member-home-stat-label">
                    {t('discover.homeStatProfile')}
                  </p>
                  <p className="member-home-stat-value">{completionPercent} %</p>
                  <div
                    className="member-home-stat-bar"
                    role="progressbar"
                    aria-valuenow={completionPercent ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t('discover.homeStatProfile')}
                  >
                    <span style={{ width: `${completionPercent}%` }} />
                  </div>
                </div>
              )}
              {showMatchesStat && (
                <div className="member-home-stat">
                  <p className="member-home-stat-label">
                    {t('discover.homeStatMatches')}
                  </p>
                  <p className="member-home-stat-value">{firstWordCount}</p>
                </div>
              )}
              {showPremiumUntil && (
                <div className="member-home-stat">
                  <p className="member-home-stat-label">
                    {t('discover.homeStatPremium')}
                  </p>
                  <p className="member-home-stat-value">{premiumUntilLabel}</p>
                </div>
              )}
            </div>
          )}
          </div>
        </section>

        <div className="member-home-body">
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">
                {t('discover.suggestionsTitle')}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('discover.suggestionsSubtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenProfile}
              className="text-xs font-semibold text-aypik-navy hover:text-aypik-magenta"
            >
              {t('profile.title')}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          {toast && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-sm px-3 py-2 text-center animate-pop">
              {toast}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-9 h-9 rounded-full border-4 border-aypik-border border-t-aypik-navy animate-spin" />
            </div>
          ) : suggestions.length === 0 && error ? null : suggestions.length === 0 ? (
            <div className="member-home-empty">
              <Sparkles className="member-home-empty-icon" aria-hidden />
              <h3 className="member-home-empty-title">
                {t('discover.homeEmptyTitle')}
              </h3>
              <p className="member-home-empty-body">{t('discover.homeEmptyBody')}</p>
              <div
                className={
                  showCompleteAction
                    ? 'member-home-empty-actions'
                    : 'member-home-empty-actions member-home-empty-actions--count-2'
                }
              >
                <button
                  type="button"
                  className="member-home-empty-action"
                  onClick={openWiderZone}
                >
                  <span className="member-home-empty-pill member-home-empty-pill--zone">
                    <MapPin className="w-4 h-4" aria-hidden />
                  </span>
                  <span>
                    <span className="member-home-empty-action-title">
                      {t('discover.homeWidenTitle')}
                    </span>
                    <span className="member-home-empty-action-sub">
                      {t('discover.homeWidenSubtitle')}
                    </span>
                  </span>
                </button>
                {showCompleteAction && (
                  <button
                    type="button"
                    className="member-home-empty-action"
                    onClick={onOpenProfile}
                  >
                    <span className="member-home-empty-pill member-home-empty-pill--profile">
                      <User className="w-4 h-4" aria-hidden />
                    </span>
                    <span>
                      <span className="member-home-empty-action-title">
                        {t('discover.homeCompleteTitle')}
                      </span>
                      <span className="member-home-empty-action-sub">
                        {t('discover.homeCompleteSubtitle', {
                          percent: completionPercent,
                        })}
                      </span>
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  className="member-home-empty-action"
                  onClick={() => {
                    void shareSite();
                  }}
                >
                  <span className="member-home-empty-pill member-home-empty-pill--invite">
                    <Share2 className="w-4 h-4" aria-hidden />
                  </span>
                  <span>
                    <span className="member-home-empty-action-title">
                      {t('discover.homeInviteTitle')}
                    </span>
                    <span className="member-home-empty-action-sub">
                      {t('discover.homeInviteSubtitle')}
                    </span>
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <ul className="profile-cards-grid overflow-visible">
              {suggestions.slice(0, HOME_SUGGESTIONS_MAX).map((p) => {
                const unreadCount = unreadBySender[p.id] || 0;
                return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setOpenProfile(p)}
                    aria-label={
                      unreadCount > 0
                        ? t('discover.viewProfileUnread', {
                            name: p.display_name,
                            unread: unreadMessagesLabel(unreadCount),
                          })
                        : t('discover.viewProfile', { name: p.display_name })
                    }
                    className={`w-full text-left rounded-2xl border bg-white overflow-hidden shadow-sm hover:shadow-md transition-all animate-fadeIn cursor-pointer ${
                      unreadCount > 0
                        ? 'border-aypik-navy ring-2 ring-aypik-border'
                        : 'border-gray-100 hover:border-aypik-border'
                    }`}
                  >
                    <div className="aspect-[4/5] bg-aypik-border relative">
                      {p.photo_url ? (
                        <ProfilePhoto
                          src={p.photo_url}
                          eager
                          className="w-full h-full object-cover pointer-events-none"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white/80">
                          {p.display_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <OnlinePresenceDot online={p.is_online} />
                      <ProfileCardCornerBadges
                        age={p.age}
                        isFounder={p.is_founder}
                        founderNumber={p.founder_number}
                      />
                      {unreadCount > 0 && (
                        <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-aypik-navy text-white text-[10px] font-bold shadow-md">
                          <MessageCircle className="w-3 h-3" />
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="p-3 space-y-1">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {p.display_name}
                      </p>
                      {isInternationalPerimeter(geoPerimeter) ? (
                        <InternationalCardGeoFacts
                          {...formatInternationalGeoFacts({
                            worldZone: p.world_zone,
                            countryCode: p.country_code,
                            cityName: p.city_name,
                            location: p.location,
                            distanceKm: p.distance_km,
                          })}
                        />
                      ) : (
                        <>
                          {p.location && (
                            <p className="flex items-center gap-1 text-[11px] text-gray-500 truncate">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {p.location}
                            </p>
                          )}
                          <CardGeoFacts
                            flags={p}
                            location={p.location}
                            perimeter={geoPerimeter}
                            distanceKm={p.distance_km}
                          />
                        </>
                      )}
                      {p.mutual_interest_count > 0 && (
                        <p className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                          <Sparkles className="w-3 h-3" />
                          {t('discover.mutualInterest', {
                            count: p.mutual_interest_count,
                          })}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
                );
              })}
            </ul>
          )}
        </section>
        </div>
      </div>

      {openProfile && (
        <ProfileDetailModal
          candidate={openProfile}
          geoPerimeter={geoPerimeter}
          alreadyFlashed={flashedIds.has(openProfile.id)}
          alreadyLiked={likedIds.has(openProfile.id)}
          busy={actingId === openProfile.id}
          likesExhausted={likesExhausted}
          showFlashCta={showFlashCta}
          unreadCount={unreadBySender[openProfile.id] || 0}
          onClose={() => setOpenProfile(null)}
          onLike={() => void handleLike(openProfile)}
          onFlash={() => void handleFlash(openProfile)}
          onSkip={() => handleSkip(openProfile.id)}
          onOpenChat={
            (unreadBySender[openProfile.id] || 0) > 0
              ? () => onOpenMatches(openProfile.id, true)
              : undefined
          }
        />
      )}
    </div>
  );
}
