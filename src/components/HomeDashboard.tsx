import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Compass,
  Heart,
  LogOut,
  MapPin,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import AccountMenu from '@/components/AccountMenu';
import { AccountStatusBadges } from '@/components/AccountStatusBadge';
import { BrandLockup, BrandMark, BRAND_GRADIENT_CSS } from '@/components/BrandLockup';
import { ProfileCardCornerBadges } from '@/components/membership/Badges';
import NotificationsBell from '@/components/NotificationsBell';
import ProfileDetailModal from '@/components/ProfileDetailModal';
import ProfilePhoto from '@/components/ProfilePhoto';
import { OnlinePresenceDot } from '@/components/OnlinePresenceDot';
import UnreadBadge, { unreadMessagesLabel } from '@/components/UnreadBadge';
import { CardGeoFacts } from '@/components/GeoBadgeLine';
import {
  fetchSuggestedProfiles,
  HOME_SUGGESTIONS_MAX,
  type SuggestedProfile,
} from '@/lib/suggestions';
import { loadSuggestionPrefs } from '@/lib/suggestionPrefs';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/components/ProfileSetup';
import { ageFromBirthDate } from '@/lib/dating';
import { queryKeys } from '@/lib/queryClient';
import { useMembership } from '@/lib/useMembership';
import { isFounderPeriodActive } from '@/lib/membership';
import { flashErrorMessage, isFlashCtaVisible, sendFlash } from '@/lib/flashes';
import { userErrorMessage } from '@/lib/userError';
import type { OpenMatchesOpts } from '@/lib/matchesNav';
import {
  ACCOUNT_STATUS_HOME_BANNER,
  resolveVisibilityChoice,
  type AccountStatusId,
  type VisibilityChoice,
} from '@/lib/accountStatus';

type HomeSuggestion = SuggestedProfile & {
  is_founder?: boolean;
  founder_number?: number | null;
};

export default function HomeDashboard({
  displayName,
  onSignOut,
  onOpenDiscover,
  onOpenMatches,
  onOpenProfile,
  onOpenPassword,
  onOpenNotifications,
  unreadTotal = 0,
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
}: {
  displayName: string;
  onSignOut?: () => void;
  onOpenDiscover: () => void;
  onOpenMatches: (actorId?: string | null, opts?: OpenMatchesOpts) => void;
  onOpenProfile: () => void;
  onOpenPassword: () => void;
  onOpenNotifications: () => void;
  unreadTotal?: number;
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
}) {
  const { user } = useAuth();
  const { status, refresh } = useMembership();
  const [hiddenIds, setHiddenIds] = useState(() => new Set<string>());
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openProfile, setOpenProfile] = useState<HomeSuggestion | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const founderActive = isFounderPeriodActive(status);
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
      profileEpoch
    ),
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data: me } = await supabase
        .from('profiles')
        .select('interests, birth_date, gender, location, lat, lng')
        .eq('id', user!.id)
        .maybeSingle();

      const meProfile = me as Profile | null;
      const prefs = loadSuggestionPrefs(user!.id);
      const list = await fetchSuggestedProfiles({
        limit: HOME_SUGGESTIONS_MAX,
        myInterests: (meProfile?.interests || []) as string[],
        myAge: meProfile?.birth_date
          ? ageFromBirthDate(meProfile.birth_date)
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

      const [{ data: likes }, { data: flashes }] = await Promise.all([
        supabase.from('likes').select('to_user').eq('from_user', user!.id),
        supabase.from('flashes').select('to_user').eq('from_user', user!.id),
      ]);

      return {
        list: list as HomeSuggestion[],
        likedIds: new Set((likes || []).map((l) => l.to_user as string)),
        flashedIds: new Set((flashes || []).map((f) => f.to_user as string)),
      };
    },
  });

  useEffect(() => {
    if (!homeQuery.data) return;
    setLikedIds(homeQuery.data.likedIds);
    setFlashedIds(homeQuery.data.flashedIds);
  }, [homeQuery.data]);

  const suggestions = useMemo(
    () =>
      (homeQuery.data?.list || []).filter((p) => !hiddenIds.has(p.id)),
    [homeQuery.data, hiddenIds]
  );
  const loading = homeQuery.isLoading;
  const error =
    actionError ||
    (homeQuery.error
      ? homeQuery.error instanceof Error
        ? homeQuery.error.message
        : 'Impossible de charger les suggestions'
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
        const { error: likeErr } = await supabase.from('likes').insert({
          from_user: user.id,
          to_user: candidate.id,
        });
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
          setToast(`C’est un match avec ${candidate.display_name} !`);
          window.setTimeout(() => setToast(null), 2800);
        }

        await refresh();
      } catch (err) {
        setActionError(userErrorMessage(err, 'Une erreur est survenue'));
      } finally {
        setActingId(null);
      }
    },
    [user, actingId, likesExhausted, likedIds, refresh]
  );

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
            ? 'Tu as déjà flashé ce profil'
            : result.matched
              ? `C’est un match avec ${candidate.display_name} !`
              : `Flash envoyé à ${candidate.display_name} ✨`
        );

        window.setTimeout(() => setToast(null), 2800);
      } catch {
        setActionError('Impossible d’envoyer le flash');
      } finally {
        setActingId(null);
      }
    },
    [user, actingId, flashedIds, status, showFlashCta]
  );

  return (
    <div className="min-h-full flex flex-col bg-[#fff8f5]">
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-rose-100/80">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3 pt-2.5 pb-2.5 sm:h-14 sm:py-0">
            <div className="flex items-center gap-2 min-w-0">
              <BrandMark size="sm" />
              <BrandLockup />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <NotificationsBell
                onOpenInbox={onOpenMatches}
                active={notificationsActive}
              />
              {onSignOut && user?.id ? (
                <AccountMenu
                  displayName={displayName}
                  visibilityChoice={resolveVisibilityChoice({
                    paused,
                    deactivated: !paused && visibilityUi === 'deactivated',
                    incognito: !paused && visibilityUi === 'incognito',
                  })}
                  onVisibilityChange={
                    onVisibilityChange ?? (async () => null)
                  }
                  openRequestKey={accountMenuRequestKey}
                  onOpenProfile={onOpenProfile}
                  onOpenPassword={onOpenPassword}
                  onOpenNotifications={onOpenNotifications}
                  onSignOut={onSignOut}
                />
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1.5 max-w-[9rem] truncate text-sm font-semibold text-gray-800 ml-1">
                  {displayName}
                </span>
              )}
              <AccountStatusBadges
                statuses={accountStatuses}
                onSelect={onAccountStatusClick}
              />
              {onSignOut && (
                <>
                  <span
                    className="hidden sm:block w-px h-4 bg-gray-200 mx-1.5 shrink-0"
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={onSignOut}
                    title="Déconnexion"
                    aria-label="Déconnexion"
                    className="inline-flex items-center justify-center p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                  >
                    <LogOut className="w-4 h-4" aria-hidden />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto w-full px-4 pt-8 pb-10 space-y-8">
        <section className="text-center space-y-3 animate-fadeIn">
          <p
            className="text-xs font-extrabold uppercase tracking-[0.28em] bg-clip-text text-transparent"
            style={{ backgroundImage: BRAND_GRADIENT_CSS }}
          >
            Aypik
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Bonjour, {displayName}
          </h1>
          <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
            Des profils proches de toi, de ton âge et de tes centres
            d’intérêt — sélectionnés pour toi.
          </p>
          {accountStatuses[0] && (
            <p className={ACCOUNT_STATUS_HOME_BANNER[accountStatuses[0]].className}>
              {ACCOUNT_STATUS_HOME_BANNER[accountStatuses[0]].text}
            </p>
          )}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onOpenDiscover}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200/60 hover:opacity-95 transition-opacity"
            >
              <Compass className="w-4 h-4" />
              Découvrir
            </button>
            <button
              type="button"
              onClick={() => onOpenMatches()}
              className="relative w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl border border-rose-200 bg-white/80 text-gray-800 font-semibold hover:bg-white transition-colors"
              aria-label={
                unreadTotal > 0
                  ? `Mes matchs, ${unreadMessagesLabel(unreadTotal)}`
                  : 'Mes matchs'
              }
            >
              <Heart className="w-4 h-4 text-rose-500" />
              Mes matchs
              {unreadTotal > 0 && (
                <UnreadBadge
                  count={unreadTotal}
                  pulse
                  className="absolute -top-1.5 -right-1.5"
                />
              )}
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">
                Suggestions pour toi
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Près de chez toi · âge · centres d’intérêt
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenProfile}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700"
            >
              Mon profil
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
              <div className="w-9 h-9 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
            </div>
          ) : suggestions.length === 0 && error ? null : suggestions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-rose-200 bg-white/70 px-5 py-10 text-center">
              <Sparkles className="w-7 h-7 text-rose-300 mx-auto mb-2" />
              <p className="text-sm text-gray-600 leading-relaxed">
                Aucun profil ne correspond actuellement à ta zone
                géographique et à tes centres d’intérêt. Modifie tes
                préférences dans la section{' '}
                <strong className="font-semibold text-gray-800">
                  Découvrir
                </strong>{' '}
                ou reviens plus tard.
              </p>
              <button
                type="button"
                onClick={onOpenDiscover}
                className="mt-4 text-sm font-semibold text-rose-600"
              >
                Découvrir les profils →
              </button>
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
                        ? `Voir le profil de ${p.display_name}, ${unreadMessagesLabel(unreadCount)}`
                        : `Voir le profil de ${p.display_name}`
                    }
                    className={`w-full text-left rounded-2xl border bg-white overflow-hidden shadow-sm hover:shadow-md transition-all animate-fadeIn cursor-pointer ${
                      unreadCount > 0
                        ? 'border-rose-300 ring-2 ring-rose-100'
                        : 'border-gray-100 hover:border-rose-100'
                    }`}
                  >
                    <div className="aspect-[4/5] bg-gradient-to-br from-rose-100 to-amber-100 relative">
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
                        isBoosted={p.is_boosted}
                        isFounder={p.is_founder}
                        founderNumber={p.founder_number}
                      />
                      {unreadCount > 0 && (
                        <span className={`absolute right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold shadow-md ${
                          p.is_founder ? 'bottom-9 sm:bottom-2' : 'bottom-2'
                        }`}>
                          <MessageCircle className="w-3 h-3" />
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="p-3 space-y-1">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {p.display_name}
                      </p>
                      {p.location && (
                        <p className="flex items-center gap-1 text-[11px] text-gray-500 truncate">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {p.location}
                        </p>
                      )}
                      {p.mutual_interest_count > 0 && (
                        <p className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                          <Sparkles className="w-3 h-3" />
                          {p.mutual_interest_count === 1
                            ? "1 centre d'intérêt en commun"
                            : `${p.mutual_interest_count} centres d'intérêt en commun`}
                        </p>
                      )}
                      <CardGeoFacts
                        flags={p}
                        location={p.location}
                        perimeter={geoPerimeter}
                        distanceKm={p.distance_km}
                      />
                    </div>
                  </button>
                </li>
                );
              })}
            </ul>
          )}
        </section>
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
