import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Heart,
  MapPin,
  MessageCircle,
  Sparkles,
  AlertCircle,
  Zap,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useMembership } from '@/lib/useMembership';
import { PROFILE_OWN_COLUMNS, type Profile } from '@/components/ProfileSetup';
import { BoostedBadge, FounderBadge } from '@/components/membership/Badges';
import {
  AdvancedFiltersTeaser,
  LikesQuotaHint,
} from '@/components/membership/PremiumTeasers';
import { SoftPremiumBanner } from '@/components/membership/SoftPremium';
import { SITE_FREE_MODE, offerLabel } from '@/lib/founderCopy';
import { formatPremiumPriceLabel, isFounderPeriodActive } from '@/lib/membership';
import { flashErrorMessage, isFlashCtaVisible, sendFlash } from '@/lib/flashes';
import { sendFlashReceivedEmail } from '@/lib/email/sendFlashEmail';
import {
  GEO_PERIMETER_FILTER_LABEL,
  GEO_PERIMETER_OPTIONS,
  GEO_RADIUS_KM_OPTIONS,
  isGeoPerimeterFilter,
  isGeoRadiusKm,
} from '@/lib/geoProximity';
import {
  fetchDiscoveryCatalog,
  fetchPlatformSignupCount,
  type DiscoveryCandidate,
  type DiscoverySortId,
} from '@/lib/discoveryCatalog';
import { ensureProfileCoordinates } from '@/lib/profileCoordinates';
import {
  ACTIFS_SORT_HINT,
  DISTANCE_SORT_HINT,
  INTERESTS_SORT_HINT,
  newProfilesCutoffIso,
  newProfilesSortHint,
  newProfilesWindowMonths,
  sortDiscoveryCandidates,
} from '@/lib/discoverySort';
import { useSuggestionPrefs, syncDiscoverPrefs, flushDiscoverPrefs } from '@/lib/suggestionPrefs';
import ProfileDetailModal from '@/components/ProfileDetailModal';
import ProfilePhoto from '@/components/ProfilePhoto';
import { unreadMessagesLabel } from '@/components/UnreadBadge';
import { userErrorMessage } from '@/lib/userError';
import { queryKeys, SIGNUP_COUNT_STALE_MS } from '@/lib/queryClient';

const SORT_OPTIONS = [
  {
    id: 'nouveaux',
    label: 'Nouveaux profils',
    icon: '🕒',
  },
  {
    id: 'distance',
    label: 'Distance',
    icon: '📍',
  },
  {
    id: 'interests',
    label: 'Centres d’intérêt',
    icon: 'palette',
  },
  {
    id: 'actifs',
    label: 'Actifs',
    icon: '💫',
  },
] as const;

type SortChoice = (typeof SORT_OPTIONS)[number]['id'];

/** Palette jaune + taches franches, sans teinte rose du bouton. */
function PaletteSortIcon() {
  return (
    <svg
      viewBox="2.2 2 14.2 12.4"
      width="1em"
      height="1em"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#E8C36A"
        d="M10.2 2.2c-4.3 0-7.8 3.2-7.8 7.6 0 2.6 1.4 4.4 3.3 4.4 1.1 0 1.6-.6 2.2-1.4.4-.6.9-1.3 1.8-1.3h.6c3.2 0 5.8-2.4 5.8-5.4 0-2.3-2.5-3.9-5.9-3.9Z"
      />
      <circle cx="7.1" cy="6.6" r="1.25" fill="#E53935" />
      <circle cx="10.4" cy="5.5" r="1.2" fill="#FB8C00" />
      <circle cx="13.4" cy="7" r="1.2" fill="#FDD835" />
      <circle cx="8.1" cy="10.4" r="1.2" fill="#43A047" />
      <circle cx="11.6" cy="10.1" r="1.15" fill="#1E88E5" />
      <circle cx="14.2" cy="9.4" r="1.05" fill="#5C6BC0" />
    </svg>
  );
}

type Candidate = DiscoveryCandidate;

export default function DiscoveryPage({
  unreadBySender = {},
  onOpenUnreadChat,
  profileEpoch = 0,
}: {
  unreadBySender?: Record<string, number>;
  onOpenUnreadChat?: (actorId: string) => void;
  /** Incrémenté après une MAJ profil / à chaque visite Découvrir : force un reload DB. */
  profileEpoch?: number;
} = {}) {
  const { user } = useAuth();
  const userId = user?.id;
  const { status, refresh, loading: membershipLoading } = useMembership();
  const [actingId, setActingId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showFiltersHint, setShowFiltersHint] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [prefs, setPrefs] = useSuggestionPrefs(userId, {
    listen: false,
    persistOnChange: false,
  });
  const { geoPerimeter, geoRadiusKm, minOverlap } = prefs;
  const [sortChoice, setSortChoice] = useState<SortChoice>('nouveaux');
  const [openProfile, setOpenProfile] = useState<Candidate | null>(null);
  const canFilter = status.can_use_advanced_filters;
  const geoFilterActive = geoPerimeter !== 'anywhere';
  const hasActiveFilter = geoFilterActive || minOverlap > 0;
  /**
   * Masqués tout de suite dans la grille du filtre actif (like / flash / masquer).
   * Conservés pour les fetches suivants de la visite.
   */
  const [sessionHiddenIds, setSessionHiddenIds] = useState(
    () => new Set<string>()
  );
  /**
   * Consultés sans like ni flash : restent visibles sur le filtre en cours,
   * exclus seulement au changement de filtres / périmètre élargi.
   */
  const sessionViewedIdsRef = useRef<Set<string>>(new Set());
  const sessionHiddenIdsRef = useRef(sessionHiddenIds);
  sessionHiddenIdsRef.current = sessionHiddenIds;
  const lastFetchPrefsKeyRef = useRef<string | null>(null);

  const hideFromCurrentFilter = useCallback((id: string) => {
    if (!id) return;
    sessionViewedIdsRef.current.add(id);
    setSessionHiddenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const markViewedForLaterFilters = useCallback((id: string) => {
    if (id) sessionViewedIdsRef.current.add(id);
  }, []);

  if (userId) syncDiscoverPrefs(userId, prefs);

  useLayoutEffect(() => {
    if (!userId) return;
    const flush = () => {
      flushDiscoverPrefs(userId);
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [userId]);

  const viewerQuery = useQuery({
    queryKey: queryKeys.discoverViewer(userId, profileEpoch),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select(PROFILE_OWN_COLUMNS)
        .eq('id', userId!)
        .maybeSingle();
      if (profileErr || !profile) {
        throw new Error('Impossible de charger ton profil');
      }
      const loaded = profile as Profile;
      void ensureProfileCoordinates(loaded);
      const [{ data: likes }, { data: flashes }] = await Promise.all([
        supabase.from('likes').select('to_user').eq('from_user', userId!),
        supabase.from('flashes').select('to_user').eq('from_user', userId!),
      ]);
      return {
        profile: loaded,
        likedIds: new Set((likes || []).map((l) => l.to_user as string)),
        flashedIds: new Set((flashes || []).map((f) => f.to_user as string)),
      };
    },
  });

  const myProfile = viewerQuery.data?.profile ?? null;

  useEffect(() => {
    if (!viewerQuery.data) return;
    setLikedIds(viewerQuery.data.likedIds);
    setFlashedIds(viewerQuery.data.flashedIds);
  }, [viewerQuery.data]);

  const { data: signupCount = 0 } = useQuery({
    queryKey: queryKeys.signupCount(),
    queryFn: fetchPlatformSignupCount,
    staleTime: SIGNUP_COUNT_STALE_MS,
    enabled: Boolean(userId),
  });

  const prefsKey = `${prefs.geoPerimeter}|${prefs.geoRadiusKm}|${prefs.minOverlap}`;
  const newMonths = newProfilesWindowMonths(signupCount);
  const cutoffIso = useMemo(
    () => (sortChoice === 'nouveaux' ? newProfilesCutoffIso(newMonths) : null),
    [sortChoice, newMonths]
  );

  const catalogQuery = useQuery({
    queryKey: queryKeys.discoveryCatalog(
      userId,
      prefsKey,
      sortChoice,
      cutoffIso,
      profileEpoch
    ),
    enabled: Boolean(userId && myProfile),
    queryFn: ({ signal }) => {
      const excludeIds = Array.from(sessionHiddenIdsRef.current);
      const filtersChanged =
        lastFetchPrefsKeyRef.current !== null &&
        lastFetchPrefsKeyRef.current !== prefsKey;
      if (filtersChanged) {
        sessionViewedIdsRef.current.forEach((id) => excludeIds.push(id));
      }
      lastFetchPrefsKeyRef.current = prefsKey;
      return fetchDiscoveryCatalog({
        userId: userId!,
        myProfile: myProfile!,
        prefs,
        sort: sortChoice as DiscoverySortId,
        createdAfter: cutoffIso,
        excludeIds,
        signal,
      });
    },
  });

  const catalog = catalogQuery.data ?? [];
  const candidates = useMemo(
    () => catalog.filter((c) => !sessionHiddenIds.has(c.id)),
    [catalog, sessionHiddenIds]
  );
  const loading = viewerQuery.isLoading;
  const searching = catalogQuery.isLoading;
  const catalogError = catalogQuery.error
    ? userErrorMessage(catalogQuery.error, 'Impossible de charger les profils')
    : viewerQuery.error
      ? userErrorMessage(viewerQuery.error, 'Impossible de charger ton profil')
      : null;
  const displayError = error || catalogError;

  const founderActive = isFounderPeriodActive(status);
  const likesUnlimited = status.unlimited_likes || founderActive;
  const likesExhausted =
    !likesUnlimited && (status.likes_remaining_today ?? 0) <= 0;
  const showFlashCta = isFlashCtaVisible(status);
  const priceLabel = SITE_FREE_MODE
    ? undefined
    : formatPremiumPriceLabel(
        status.premium_price_cents,
        status.premium_currency,
        status.premium_interval
      );

  const sortHints: Record<SortChoice, string> = {
    nouveaux: newProfilesSortHint(newMonths),
    distance: DISTANCE_SORT_HINT,
    interests: INTERESTS_SORT_HINT,
    actifs: ACTIFS_SORT_HINT,
  };

  const displayed = useMemo(
    () => sortDiscoveryCandidates(candidates, sortChoice, newMonths),
    [candidates, sortChoice, newMonths]
  );

  const countLabel = `${displayed.length} profil${displayed.length > 1 ? 's' : ''}`;

  useEffect(() => {
    if (!openProfile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenProfile(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openProfile]);

  const handleLike = useCallback(
    async (candidate: Candidate) => {
      if (!user || actingId || likesExhausted || likedIds.has(candidate.id))
        return;

      setActingId(candidate.id);
      setError(null);

      try {
        const { error: likeErr } = await supabase.from('likes').insert({
          from_user: user.id,
          to_user: candidate.id,
        });
        if (likeErr) throw likeErr;
        hideFromCurrentFilter(candidate.id);
        setLikedIds((prev) => new Set(prev).add(candidate.id));
        setOpenProfile((open) => (open?.id === candidate.id ? null : open));

        const { data: reverse } = await supabase
          .from('likes')
          .select('id')
          .eq('from_user', candidate.id)
          .eq('to_user', user.id)
          .maybeSingle();

        if (reverse) {
          setToast(`C’est un match avec ${candidate.display_name} !`);
          window.setTimeout(() => setToast(null), 2800);
        }

        await refresh();
      } catch {
        setError('Une erreur est survenue');
      } finally {
        setActingId(null);
      }
    },
    [user, actingId, likesExhausted, likedIds, refresh, hideFromCurrentFilter]
  );

  const handleSkip = useCallback(
    (id: string) => {
      hideFromCurrentFilter(id);
      setOpenProfile((open) => (open?.id === id ? null : open));
    },
    [hideFromCurrentFilter]
  );

  const openCandidate = useCallback(
    (candidate: Candidate) => {
      markViewedForLaterFilters(candidate.id);
      setOpenProfile(candidate);
    },
    [markViewedForLaterFilters]
  );

  const openUnread = useCallback(
    (candidate: Candidate) => {
      if (onOpenUnreadChat) onOpenUnreadChat(candidate.id);
      else openCandidate(candidate);
    },
    [onOpenUnreadChat, openCandidate]
  );

  const handleFlash = useCallback(
    async (candidate: Candidate) => {
      if (!user || actingId || flashedIds.has(candidate.id) || !showFlashCta)
        return;

      setActingId(candidate.id);
      setError(null);

      try {
        const result = await sendFlash(candidate.id);

        if (!result.ok) {
          setError(flashErrorMessage(result.error, status));
          return;
        }

        setFlashedIds((prev) => new Set(prev).add(candidate.id));
        hideFromCurrentFilter(candidate.id);
        setToast(
          result.already_flashed
            ? 'Tu as déjà flashé ce profil'
            : `Flash envoyé à ${candidate.display_name} ✨`
        );

        if (
          result.should_notify_email &&
          result.notification_id &&
          result.flash_id &&
          result.to_user
        ) {
          void sendFlashReceivedEmail({
            notificationId: result.notification_id,
            flashId: result.flash_id,
            toUserId: result.to_user,
            fromDisplayName: result.from_display_name,
          });
        }

        window.setTimeout(() => setToast(null), 2800);
      } catch {
        setError('Impossible d’envoyer le flash');
      } finally {
        setActingId(null);
      }
    },
    [user, actingId, flashedIds, status, showFlashCta, hideFromCurrentFilter]
  );

  if (loading || membershipLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
          <div className="text-gray-400 text-sm">Chargement...</div>
        </div>
      </div>
    );
  }

  if (displayError && !myProfile) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 text-red-700 text-sm max-w-md">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{displayError}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {status.can_use_advanced_filters ? (
        <div className="space-y-2">
          <AdvancedFiltersTeaser
            locked={false}
            expanded={showFilters}
            onToggle={() => setShowFilters((open) => !open)}
            activeCount={
              [geoFilterActive, minOverlap > 0].filter(Boolean).length
            }
            priceLabel={priceLabel}
            status={status}
          />
          {showFilters && (
            <div
              id="discovery-filters-panel"
              className="rounded-2xl border border-rose-100 bg-white px-3 py-3 space-y-2.5"
            >
              <p className="text-xs font-semibold text-rose-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Suggestions ciblées
              </p>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Périmètre géographique
                <select
                  value={geoPerimeter}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isGeoPerimeterFilter(v)) {
                      setPrefs((prev) => ({ ...prev, geoPerimeter: v }));
                    }
                  }}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-rose-300"
                >
                  {GEO_PERIMETER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {GEO_PERIMETER_FILTER_LABEL[option]}
                    </option>
                  ))}
                </select>
              </label>
              {geoPerimeter === 'radius' && (
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Distance
                  <select
                    value={geoRadiusKm}
                    onChange={(e) => {
                      const km = Number(e.target.value);
                      if (isGeoRadiusKm(km)) {
                        setPrefs((prev) => ({ ...prev, geoRadiusKm: km }));
                      }
                    }}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-rose-300"
                  >
                    {GEO_RADIUS_KM_OPTIONS.map((km) => (
                      <option key={km} value={km}>
                        {km} km
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Centres d’intérêt en commun (min.)
                <select
                  value={minOverlap === 0 ? '' : minOverlap}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPrefs((prev) => ({
                      ...prev,
                      minOverlap: v === '' ? 0 : Number(v),
                    }));
                  }}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-rose-300"
                >
                  <option value="">Indifférent</option>
                  <option value={1}>Au moins 1 centre d'intérêt</option>
                  <option value={2}>Au moins 2 centres d'intérêt</option>
                  <option value={3}>Au moins 3 centres d'intérêt</option>
                </select>
              </label>
            </div>
          )}
        </div>
      ) : (
        <AdvancedFiltersTeaser
          locked={!status.can_use_advanced_filters}
          onAskPremium={() => setShowFiltersHint(true)}
          priceLabel={priceLabel}
          status={status}
        />
      )}

      {showFiltersHint && !status.can_use_advanced_filters && !SITE_FREE_MODE && (
        <SoftPremiumBanner
          title="Filtres avancés"
          description={
            isFounderPeriodActive(status) || status.plan === 'premium'
              ? `Ville, centres d’intérêt et affinage : inclus dans ${offerLabel(status)}${
                  priceLabel ? ` (${priceLabel})` : ''
                }. La navigation de base reste libre.`
              : priceLabel
                ? `Ville, centres d’intérêt et affinage : disponibles avec Premium (${priceLabel}). La navigation de base reste libre.`
                : SITE_FREE_MODE
                  ? 'Ville, centres d’intérêt et affinage : la navigation de base reste libre.'
                  : 'Ville, centres d’intérêt et affinage : disponibles avec Premium. La navigation de base reste libre.'
          }
          priceLabel={priceLabel}
        />
      )}

      {displayError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{displayError}</span>
        </div>
      )}

      {toast && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-sm px-3 py-2 text-center animate-pop">
          {toast}
        </div>
      )}

      {searching ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
            <div className="text-gray-400 text-sm">Recherche en cours...</div>
          </div>
        </div>
      ) : displayError ? null : candidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center gap-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-50 to-amber-50 flex items-center justify-center">
            <Heart className="w-9 h-9 text-rose-300" />
          </div>
          {hasActiveFilter ? (
            <p className="text-gray-600 text-sm max-w-sm leading-relaxed">
              Aucun profil ne correspond à ces filtres.
            </p>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900">
                C'est tout pour le moment
              </h2>
              <p className="text-gray-500 max-w-sm">
                Reviens plus tard pour découvrir de nouveaux profils.
              </p>
            </>
          )}
          {!canFilter && !SITE_FREE_MODE && (
            <div className="w-full max-w-sm">
              <SoftPremiumBanner
                title="Affiner tes rencontres"
                description={
                  isFounderPeriodActive(status) || status.plan === 'premium'
                    ? `Les filtres par ville et centres d’intérêt sont inclus dans ${offerLabel(status)}${
                        priceLabel ? ` (${priceLabel})` : ''
                      } — sans toucher au gratuit de base.`
                    : priceLabel
                      ? `Les filtres par ville et centres d’intérêt sont inclus avec Premium (${priceLabel}) — sans toucher au gratuit de base.`
                      : SITE_FREE_MODE
                        ? 'Les filtres par ville et centres d’intérêt restent optionnels — la navigation de base est libre.'
                        : 'Les filtres par ville et centres d’intérêt sont inclus avec Premium — sans toucher au gratuit de base.'
                }
                priceLabel={priceLabel}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs text-gray-400">{countLabel}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <p
                id="discovery-sort-label"
                className="text-[11px] text-gray-400 shrink-0"
              >
                Trier par :
              </p>
              <div
                role="radiogroup"
                aria-labelledby="discovery-sort-label"
                className="discovery-sort-pills flex flex-wrap gap-1.5"
              >
              {SORT_OPTIONS.map((option) => {
                const selected = sortChoice === option.id;
                const hint = sortHints[option.id];
                return (
                  <div
                    key={option.id}
                    className={`discovery-sort-pill${selected ? ' discovery-sort-pill--active' : ''}`}
                  >
                    <span className="discovery-sort-hint" aria-hidden="true">
                      <span className="discovery-sort-hint-panel">
                        <span className="discovery-sort-hint-inner">{hint}</span>
                      </span>
                    </span>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${option.label}. ${hint}`}
                      onClick={() => setSortChoice(option.id)}
                      className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all ${
                        selected
                          ? 'discovery-sort-pill-active'
                          : 'bg-white text-gray-800 border-gray-200 hover:bg-neutral-50 hover:border-gray-300'
                      }`}
                    >
                      <span className="sort-icon" aria-hidden>
                        {option.icon === 'palette' ? (
                          <PaletteSortIcon />
                        ) : (
                          option.icon
                        )}
                      </span>
                      {option.label}
                    </button>
                  </div>
                );
              })}
              </div>
            </div>
          </div>

          {displayed.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              {sortChoice === 'nouveaux'
                ? 'Aucun nouveau profil sur cette période.'
                : 'Profils masqués. Les filtres n’ont pas changé le résultat.'}
            </p>
          ) : (
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 overflow-visible">
            {displayed.map((c, index) => (
                <DiscoveryCard
                  key={c.id}
                  candidate={c}
                  eager={index < 4}
                  unreadCount={unreadBySender[c.id] || 0}
                  alreadyFlashed={flashedIds.has(c.id)}
                  alreadyLiked={likedIds.has(c.id)}
                  busy={actingId === c.id}
                  likesExhausted={likesExhausted}
                  showFlashCta={showFlashCta}
                  onOpen={openCandidate}
                  onOpenUnread={openUnread}
                  onSkip={handleSkip}
                  onFlash={handleFlash}
                  onLike={handleLike}
                />
            ))}
          </ul>
          )}

          <div className="pt-1 space-y-2">
            {showFlashCta && (
              <p className="flex items-center justify-center flex-wrap gap-x-1 gap-y-0.5 text-center text-xs text-amber-700/80">
                <span className="inline-flex items-center gap-0.5">
                  <Zap className="w-3 h-3" aria-hidden />
                  Flash
                </span>
                <span aria-hidden>&amp;</span>
                <span className="inline-flex items-center gap-0.5">
                  <Heart className="w-3 h-3" fill="currentColor" aria-hidden />
                  Like
                </span>
                <span>
                  : notifient la personne
                  {status.plan !== 'premium' && !isFounderPeriodActive(status)
                    ? ' (3 / jour en freemium)'
                    : ''}
                </span>
              </p>
            )}
            <LikesQuotaHint status={status} />
          </div>
        </div>
      )}

      {openProfile && (
        <ProfileDetailModal
          candidate={openProfile}
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
            (unreadBySender[openProfile.id] || 0) > 0 && onOpenUnreadChat
              ? () => onOpenUnreadChat(openProfile.id)
              : undefined
          }
        />
      )}
    </div>
  );
}

const DiscoveryCard = memo(function DiscoveryCard({
  candidate: c,
  eager,
  unreadCount,
  alreadyFlashed,
  alreadyLiked,
  busy,
  likesExhausted,
  showFlashCta,
  onOpen,
  onOpenUnread,
  onSkip,
  onFlash,
  onLike,
}: {
  candidate: Candidate;
  eager: boolean;
  unreadCount: number;
  alreadyFlashed: boolean;
  alreadyLiked: boolean;
  busy: boolean;
  likesExhausted: boolean;
  showFlashCta: boolean;
  onOpen: (c: Candidate) => void;
  onOpenUnread: (c: Candidate) => void;
  onSkip: (id: string) => void;
  onFlash: (c: Candidate) => void;
  onLike: (c: Candidate) => void;
}) {
  const geoBadge = c.geo_badge;
  return (
    <li>
      <article
        className={`relative rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all animate-fadeIn cursor-pointer ${
          unreadCount > 0
            ? 'border-rose-300 ring-2 ring-rose-100'
            : 'border-gray-100 hover:border-rose-100'
        }`}
      >
        <button
          type="button"
          className="absolute inset-0 z-[1] cursor-pointer"
          onClick={() => onOpen(c)}
          aria-label={
            unreadCount > 0
              ? `Voir le profil de ${c.display_name}, ${unreadMessagesLabel(unreadCount)}`
              : `Voir le profil de ${c.display_name}`
          }
        />
        <div className="aspect-[4/5] bg-gradient-to-br from-rose-100 to-amber-100 relative z-[2] pointer-events-none overflow-hidden rounded-t-2xl">
          {c.photo_url ? (
            <ProfilePhoto
              src={c.photo_url}
              eager={eager}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white/80">
              {c.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/40 text-white text-[11px] font-semibold backdrop-blur-sm">
            {c.age} ans
          </span>
          {(c.is_boosted || c.is_founder) && (
            <div className="absolute top-2 left-2 flex flex-col gap-1 items-start max-w-[70%]">
              {c.is_boosted && <BoostedBadge size="sm" />}
              {c.is_founder && (
                <FounderBadge number={c.founder_number} size="sm" />
              )}
            </div>
          )}
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenUnread(c);
              }}
              className="pointer-events-auto absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 pl-1.5 pr-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold shadow-md hover:bg-rose-600"
              aria-label={unreadMessagesLabel(unreadCount)}
            >
              <MessageCircle className="w-3 h-3" />
              {unreadCount > 9 ? '9+' : unreadCount}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSkip(c.id);
            }}
            className="pointer-events-auto absolute bottom-2 left-2 z-10 w-8 h-8 rounded-full bg-white/90 shadow-sm border border-white/80 flex items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer"
            title="Masquer"
            aria-label={`Masquer ${c.display_name}`}
          >
            <X className="w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </button>
        </div>
        <div className="p-3 space-y-1.5">
          <p className="text-sm font-bold text-gray-900 truncate">
            {c.display_name}
          </p>
          {c.location && (
            <p className="flex items-center gap-1 text-[11px] text-gray-500 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              {c.location}
            </p>
          )}
          {(c.mutual_interests.length > 0 || geoBadge) && (
            <div className="flex flex-col gap-0.5">
              {c.mutual_interests.length > 0 && (
                <p className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  {c.mutual_interests.length === 1
                    ? "1 centre d'intérêt en commun"
                    : `${c.mutual_interests.length} centres d'intérêt en commun`}
                </p>
              )}
              {geoBadge && (
                <p className="text-[11px] text-emerald-700 font-medium">
                  {geoBadge}
                </p>
              )}
            </div>
          )}
          <div
            className="relative z-10 flex items-center justify-center gap-2 pt-1.5 overflow-visible"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {showFlashCta && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFlash(c);
                }}
                disabled={busy || alreadyFlashed}
                className="group relative z-10 w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-40 cursor-pointer overflow-visible hover:z-20"
                aria-label={
                  alreadyFlashed
                    ? `Déjà flashé ${c.display_name}`
                    : `Flasher ${c.display_name}`
                }
              >
                <Zap className="w-4 h-4 text-white" fill="white" />
                <span className="pointer-events-none absolute z-30 top-[calc(100%-6px)] left-[calc(100%-4px)] whitespace-nowrap rounded-full border border-amber-100 bg-white/95 px-2 py-0.5 text-[11px] font-medium tracking-wide text-amber-800 shadow-sm opacity-0 transition-all duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100">
                  {alreadyFlashed ? 'Déjà flashé' : 'Envoyer un flash'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLike(c);
              }}
              disabled={busy || likesExhausted || alreadyLiked}
              className="group relative z-10 w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-40 cursor-pointer overflow-visible hover:z-20"
              aria-label={
                alreadyLiked
                  ? `Déjà liké ${c.display_name}`
                  : `Liker ${c.display_name}`
              }
            >
              <Heart className="w-4 h-4 text-white" fill="white" />
              <span className="pointer-events-none absolute z-30 top-[calc(100%-6px)] left-[calc(100%-4px)] whitespace-nowrap rounded-full border border-rose-100 bg-white/95 px-2 py-0.5 text-[11px] font-medium tracking-wide text-rose-600 shadow-sm opacity-0 transition-all duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100">
                {alreadyLiked
                  ? 'Déjà liké'
                  : likesExhausted
                    ? 'Limite de likes atteinte'
                    : 'Liker ce profil'}
              </span>
            </button>
          </div>
        </div>
      </article>
    </li>
  );
});
