import { useCallback, useEffect, useState } from 'react';
import {
  Compass,
  Heart,
  MapPin,
  MessageCircle,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { BrandLockup, BrandMark, BRAND_GRADIENT_CSS } from '@/components/BrandLockup';
import { FounderBadge } from '@/components/membership/Badges';
import NotificationsBell from '@/components/NotificationsBell';
import ProfileDetailModal from '@/components/ProfileDetailModal';
import UnreadBadge, { unreadMessagesLabel } from '@/components/UnreadBadge';
import {
  fetchSuggestedProfiles,
  type SuggestedProfile,
} from '@/lib/suggestions';
import { geoProximityBadge } from '@/lib/geoProximity';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/components/ProfileSetup';
import { ageFromBirthDate } from '@/lib/dating';
import { useMembership } from '@/lib/useMembership';
import { isFounderPeriodActive } from '@/lib/membership';
import { flashErrorMessage, isFlashCtaVisible, sendFlash } from '@/lib/flashes';
import { sendFlashReceivedEmail } from '@/lib/email/sendFlashEmail';
import type { OpenMatchesOpts } from '@/lib/matchesNav';

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
  unreadTotal = 0,
  unreadBySender = {},
}: {
  displayName: string;
  onSignOut?: () => void;
  onOpenDiscover: () => void;
  onOpenMatches: (actorId?: string | null, opts?: OpenMatchesOpts) => void;
  onOpenProfile: () => void;
  unreadTotal?: number;
  unreadBySender?: Record<string, number>;
}) {
  const { user } = useAuth();
  const { status, refresh } = useMembership();
  const [suggestions, setSuggestions] = useState<HomeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openProfile, setOpenProfile] = useState<HomeSuggestion | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());

  const founderActive = isFounderPeriodActive(status);
  const likesUnlimited = status.unlimited_likes || founderActive;
  const likesExhausted =
    !likesUnlimited && (status.likes_remaining_today ?? 0) <= 0;
  const showFlashCta = isFlashCtaVisible(status);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const { data: me } = await supabase
          .from('profiles')
          .select('interests, birth_date, gender')
          .eq('id', user.id)
          .maybeSingle();

        const meProfile = me as Profile | null;
        const list = await fetchSuggestedProfiles({
          limit: 8,
          myInterests: (meProfile?.interests || []) as string[],
          myAge: meProfile?.birth_date
            ? ageFromBirthDate(meProfile.birth_date)
            : undefined,
          viewerGender:
            meProfile?.gender === 'homme' || meProfile?.gender === 'femme'
              ? meProfile.gender
              : null,
        });

        const ids = list.map((p) => p.id);
        const founderMap = new Map<string, number | null>();
        if (ids.length > 0) {
          const { data: memberships } = await supabase
            .from('memberships')
            .select('user_id, is_founder, founder_number')
            .in('user_id', ids);

          (memberships || []).forEach((m) => {
            if (m.is_founder) {
              founderMap.set(m.user_id, m.founder_number ?? null);
            }
          });
        }

        const [{ data: likes }, { data: flashes }] = await Promise.all([
          supabase.from('likes').select('to_user').eq('from_user', user.id),
          supabase.from('flashes').select('to_user').eq('from_user', user.id),
        ]);

        if (active) {
          setSuggestions(
            list.map((p) => ({
              ...p,
              is_founder: founderMap.has(p.id),
              founder_number: founderMap.get(p.id) ?? null,
            }))
          );
          setLikedIds(new Set((likes || []).map((l) => l.to_user)));
          setFlashedIds(new Set((flashes || []).map((f) => f.to_user)));
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Impossible de charger les suggestions'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

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
      setError(null);

      try {
        const { error: likeErr } = await supabase.from('likes').insert({
          from_user: user.id,
          to_user: candidate.id,
        });
        if (likeErr) throw likeErr;
        setLikedIds((prev) => new Set(prev).add(candidate.id));
        setOpenProfile((open) => (open?.id === candidate.id ? null : open));
        setSuggestions((prev) => prev.filter((p) => p.id !== candidate.id));

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
    [user, actingId, likesExhausted, likedIds, refresh]
  );

  const handleSkip = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((p) => p.id !== id));
    setOpenProfile((open) => (open?.id === id ? null : open));
  }, []);

  const handleFlash = useCallback(
    async (candidate: HomeSuggestion) => {
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
    [user, actingId, flashedIds, status, showFlashCta]
  );

  return (
    <div className="min-h-full flex flex-col bg-[#fff8f5]">
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-rose-100/80">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark size="sm" />
            <BrandLockup />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <NotificationsBell onOpenInbox={onOpenMatches} />
            <span className="hidden sm:inline-flex items-center gap-1.5 max-w-[9rem] truncate text-sm font-semibold text-gray-800 ml-1">
              <UserRound className="w-4 h-4 text-rose-500 shrink-0" />
              {displayName}
            </span>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="text-xs font-semibold text-gray-500 hover:text-gray-800 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Déconnexion
              </button>
            )}
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
              <p className="text-sm text-gray-600">
                Pas encore de profil dans ta ville, ton département ou ta
                région. Parcours les autres profils ou reviens bientôt.
              </p>
              <button
                type="button"
                onClick={onOpenDiscover}
                className="mt-4 text-sm font-semibold text-rose-600"
              >
                Parcourir les profils →
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:gap-4">
              {suggestions.map((p) => {
                const geoBadge = geoProximityBadge(p);
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
                        <img
                          src={p.photo_url}
                          alt=""
                          className="w-full h-full object-cover pointer-events-none"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white/80">
                          {p.display_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/40 text-white text-[11px] font-semibold backdrop-blur-sm">
                        {p.age} ans
                      </span>
                      {p.is_founder && (
                        <div className="absolute top-2 left-2 max-w-[70%]">
                          <FounderBadge number={p.founder_number} size="sm" />
                        </div>
                      )}
                      {unreadCount > 0 && (
                        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold shadow-md">
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
                      {geoBadge && (
                        <p className="text-[11px] text-emerald-700 font-medium">
                          {geoBadge}
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
            (unreadBySender[openProfile.id] || 0) > 0
              ? () => onOpenMatches(openProfile.id, true)
              : undefined
          }
        />
      )}
    </div>
  );
}
