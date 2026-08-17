import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
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
import type { Profile } from '@/components/ProfileSetup';
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
  type DiscoveryCandidate,
} from '@/lib/discoveryCatalog';
import { useSuggestionPrefs, syncDiscoverPrefs, flushDiscoverPrefs } from '@/lib/suggestionPrefs';
import ProfileDetailModal from '@/components/ProfileDetailModal';
import { unreadMessagesLabel } from '@/components/UnreadBadge';

type SortChoice = 'pertinence' | 'recents' | null;

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
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(true);
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
  const [sortChoice, setSortChoice] = useState<SortChoice>(null);
  const [openProfile, setOpenProfile] = useState<Candidate | null>(null);
  const canFilter = status.can_use_advanced_filters;
  const geoFilterActive = geoPerimeter !== 'anywhere';
  const hasActiveFilter = geoFilterActive || minOverlap > 0;
  /**
   * Exclusions de la visite Découvrir (vu / like / flash).
   * Vidée uniquement en quittant la page (démontage).
   */
  const [sessionExcludedIds, setSessionExcludedIds] = useState(
    () => new Set<string>()
  );
  const fetchGenRef = useRef(0);

  const excludeFromSession = useCallback((id: string) => {
    if (!id) return;
    setSessionExcludedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
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

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setSearching(true);
    (async () => {
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (cancelled) return;

      if (profileErr || !profile) {
        setError('Impossible de charger ton profil');
        setLoading(false);
        return;
      }

      setMyProfile(profile as Profile);

      const [{ data: likes }, { data: flashes }] = await Promise.all([
        supabase.from('likes').select('to_user').eq('from_user', userId),
        supabase.from('flashes').select('to_user').eq('from_user', userId),
      ]);

      if (cancelled) return;
      setLikedIds(new Set((likes || []).map((l) => l.to_user)));
      setFlashedIds(new Set((flashes || []).map((f) => f.to_user)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, profileEpoch]);

  useEffect(() => {
    if (!myProfile || !userId) return;

    const gen = ++fetchGenRef.current;
    let cancelled = false;
    const abort = new AbortController();
    setSearching(true);
    setError(null);

    (async () => {
      try {
        const filtered = await fetchDiscoveryCatalog({
          userId,
          myProfile,
          prefs,
          signal: abort.signal,
        });
        if (cancelled || gen !== fetchGenRef.current) return;
        setCandidates(filtered);
      } catch (err) {
        if (cancelled || gen !== fetchGenRef.current) return;
        setCandidates([]);
        setError(
          err instanceof Error ? err.message : 'Impossible de charger les profils'
        );
      }
    })().finally(() => {
      if (!cancelled && gen === fetchGenRef.current) setSearching(false);
    });

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [myProfile, userId, prefs]);

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

  const visible = candidates.filter((c) => !sessionExcludedIds.has(c.id));
  const displayed = useMemo(() => {
    const list = [...visible];
    if (sortChoice === 'recents') {
      list.sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0;
        const tb = b.created_at ? Date.parse(b.created_at) : 0;
        return tb - ta || b.score - a.score;
      });
    } else {
      list.sort(
        (a, b) => b.score - a.score || Number(b.is_boosted) - Number(a.is_boosted)
      );
    }
    return list;
  }, [visible, sortChoice]);

  const countLabel = `${visible.length} profil${visible.length > 1 ? 's' : ''}`;
  const sortCaption =
    sortChoice === 'pertinence'
      ? 'classés par pertinence'
      : sortChoice === 'recents'
        ? 'classés par récents'
        : null;

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
        excludeFromSession(candidate.id);
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
    [user, actingId, likesExhausted, likedIds, refresh, excludeFromSession]
  );

  const handleSkip = useCallback(
    (id: string) => {
      excludeFromSession(id);
      setOpenProfile((open) => (open?.id === id ? null : open));
    },
    [excludeFromSession]
  );

  const openCandidate = useCallback(
    (candidate: Candidate) => {
      excludeFromSession(candidate.id);
      setOpenProfile(candidate);
    },
    [excludeFromSession]
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
        excludeFromSession(candidate.id);
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
    [user, actingId, flashedIds, status, showFlashCta, excludeFromSession]
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

  if (error && !myProfile) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 text-red-700 text-sm max-w-md">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
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
                  <option value="">Tous les profils</option>
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

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {toast && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-sm px-3 py-2 text-center animate-pop">
          {toast}
        </div>
      )}

      {membershipLoading || searching ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
            <div className="text-gray-400 text-sm">Recherche en cours...</div>
          </div>
        </div>
      ) : candidates.length === 0 ? (
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
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400">
              {countLabel}
              {sortCaption ? ` · ${sortCaption}` : ''}
            </p>
            <label className="sr-only" htmlFor="discovery-sort">
              Trier les profils
            </label>
            <select
              id="discovery-sort"
              value={sortChoice ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'pertinence' || v === 'recents') setSortChoice(v);
                else setSortChoice(null);
              }}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 focus:outline-none focus:ring-2 focus:ring-rose-300"
            >
              <option value="">Trier</option>
              <option value="pertinence">Pertinence</option>
              <option value="recents">Récents</option>
            </select>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              Profils masqués. Les filtres n’ont pas changé le résultat.
            </p>
          ) : (
          <ul className="grid grid-cols-2 gap-3 sm:gap-4">
            {displayed.map((c) => {
              const alreadyFlashed = flashedIds.has(c.id);
              const alreadyLiked = likedIds.has(c.id);
              const busy = actingId === c.id;
              const geoBadge = c.geo_badge;
              const unreadCount = unreadBySender[c.id] || 0;
              return (
                <li key={c.id}>
                  <article
                    className={`relative rounded-2xl border bg-white overflow-hidden shadow-sm hover:shadow-md transition-all animate-fadeIn cursor-pointer ${
                      unreadCount > 0
                        ? 'border-rose-300 ring-2 ring-rose-100'
                        : 'border-gray-100 hover:border-rose-100'
                    }`}
                  >
                    <button
                      type="button"
                      className="absolute inset-0 z-[1] cursor-pointer"
                      onClick={() => openCandidate(c)}
                      aria-label={
                        unreadCount > 0
                          ? `Voir le profil de ${c.display_name}, ${unreadMessagesLabel(unreadCount)}`
                          : `Voir le profil de ${c.display_name}`
                      }
                    />
                    <div className="aspect-[4/5] bg-gradient-to-br from-rose-100 to-amber-100 relative z-[2] pointer-events-none">
                      {c.photo_url ? (
                        <img
                          src={c.photo_url}
                          alt=""
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
                            if (onOpenUnreadChat) onOpenUnreadChat(c.id);
                            else openCandidate(c);
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
                          handleSkip(c.id);
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
                        className="relative z-10 flex items-center justify-center gap-2 pt-1.5"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {showFlashCta && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleFlash(c);
                            }}
                            disabled={busy || alreadyFlashed}
                            className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                            title={
                              alreadyFlashed
                                ? 'Déjà flashé'
                                : 'Envoyer un flash'
                            }
                            aria-label={
                              alreadyFlashed
                                ? `Déjà flashé ${c.display_name}`
                                : `Flasher ${c.display_name}`
                            }
                          >
                            <Zap className="w-4 h-4 text-white" fill="white" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleLike(c);
                          }}
                          disabled={busy || likesExhausted || alreadyLiked}
                          className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                          title={
                            alreadyLiked
                              ? 'Déjà liké'
                              : likesExhausted
                                ? 'Limite de likes atteinte'
                                : 'Liker ce profil'
                          }
                          aria-label={
                            alreadyLiked
                              ? `Déjà liké ${c.display_name}`
                              : `Liker ${c.display_name}`
                          }
                        >
                          <Heart className="w-4 h-4 text-white" fill="white" />
                        </button>
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
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
