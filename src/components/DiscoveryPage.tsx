import { useState, useEffect, useCallback } from 'react';
import {
  Heart,
  X,
  MapPin,
  Sparkles,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { ageFromBirthDate, minPartnerAge } from '@/lib/dating';
import { useMembership } from '@/lib/useMembership';
import type { Profile } from '@/components/ProfileSetup';
import { BoostedBadge, FounderBadge } from '@/components/membership/Badges';
import {
  AdvancedFiltersTeaser,
  LikesQuotaHint,
} from '@/components/membership/PremiumTeasers';
import { SoftPremiumBanner } from '@/components/membership/SoftPremium';
import { formatPremiumPriceLabel } from '@/lib/membership';
import { flashErrorMessage, sendFlash } from '@/lib/flashes';
import { sendFlashReceivedEmail } from '@/lib/email/sendFlashEmail';
import { rankProfileScore } from '@/lib/suggestions';

interface Candidate extends Profile {
  age: number;
  mutual_interests: string[];
  is_boosted?: boolean;
  is_founder?: boolean;
  founder_number?: number | null;
  score: number;
  same_city: boolean;
}

export default function DiscoveryPage() {
  const { user } = useAuth();
  const { status, refresh } = useMembership();
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null);
  const [showFiltersHint, setShowFiltersHint] = useState(false);
  const [sameCityOnly, setSameCityOnly] = useState(false);
  const [minOverlap, setMinOverlap] = useState(0);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileErr || !profile) {
        setError('Impossible de charger votre profil');
        setLoading(false);
        return;
      }

      setMyProfile(profile as Profile);

      const [{ data: likes }, { data: flashes }] = await Promise.all([
        supabase.from('likes').select('to_user').eq('from_user', user.id),
        supabase.from('flashes').select('to_user').eq('from_user', user.id),
      ]);

      setLikedIds(new Set((likes || []).map((l) => l.to_user)));
      setFlashedIds(new Set((flashes || []).map((f) => f.to_user)));
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (!myProfile || !user) return;
    (async () => {
      const { data, error: candErr } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', user.id)
        .eq('has_children', false);

      if (candErr) {
        setError(candErr.message);
        return;
      }

      const ids = (data || []).map((p) => (p as Profile).id);

      const boostSet = new Set<string>();
      const founderMap = new Map<string, number | null>();

      if (ids.length > 0) {
        const { data: boosts } = await supabase
          .from('profile_boosts')
          .select('user_id')
          .in('user_id', ids)
          .in('payment_status', ['paid', 'simulated'])
          .gt('ends_at', new Date().toISOString());

        (boosts || []).forEach((b) => boostSet.add(b.user_id));

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

      const myAge = ageFromBirthDate(myProfile.birth_date);
      const myMinAge = minPartnerAge(myAge);
      const canFilter = status.can_use_advanced_filters;

      const filtered: Candidate[] = (data || [])
        .map((p) => {
          const profile = p as Profile;
          const age = ageFromBirthDate(profile.birth_date);
          const mutual_interests = (profile.interests || []).filter((i) =>
            (myProfile.interests || []).includes(i)
          );
          const is_boosted = boostSet.has(profile.id);
          const same_city =
            Boolean(myProfile.location) &&
            Boolean(profile.location) &&
            (myProfile.location === profile.location ||
              myProfile.location.split('(')[0].trim().toLowerCase() ===
                profile.location.split('(')[0].trim().toLowerCase());

          return {
            ...profile,
            age,
            mutual_interests,
            is_boosted,
            is_founder: founderMap.has(profile.id),
            founder_number: founderMap.get(profile.id) ?? null,
            same_city,
            score: rankProfileScore({
              myAge,
              theirAge: age,
              myLocation: myProfile.location || '',
              theirLocation: profile.location || '',
              mutualInterestCount: mutual_interests.length,
              isBoosted: is_boosted,
            }),
          };
        })
        .filter((c) => {
          if (c.age < myMinAge) return false;
          if (myAge < minPartnerAge(c.age)) return false;
          if (likedIds.has(c.id)) return false;
          if (canFilter && sameCityOnly && !c.same_city) return false;
          if (canFilter && minOverlap > 0 && c.mutual_interests.length < minOverlap)
            return false;
          return true;
        })
        .sort((a, b) => b.score - a.score || Number(b.is_boosted) - Number(a.is_boosted));

      setCandidates(filtered);
      setCurrentIndex(0);
    })();
  }, [
    myProfile,
    user,
    likedIds,
    status.can_use_advanced_filters,
    sameCityOnly,
    minOverlap,
  ]);

  const current = candidates[currentIndex];
  const likesExhausted =
    !status.unlimited_likes && (status.likes_remaining_today ?? 0) <= 0;
  const alreadyFlashed = current ? flashedIds.has(current.id) : false;
  const priceLabel = formatPremiumPriceLabel(
    status.premium_price_cents,
    status.premium_currency,
    status.premium_interval
  );

  const advanceCard = useCallback(() => {
    setTimeout(() => {
      setCurrentIndex((i) => i + 1);
      setSwipeDir(null);
    }, 300);
  }, []);

  const handleAction = useCallback(
    async (liked: boolean) => {
      if (!user || !current || actionLoading) return;

      if (liked && likesExhausted) {
        setError(null);
        return;
      }

      setActionLoading(true);
      setSwipeDir(liked ? 'right' : 'left');
      setError(null);

      try {
        if (liked) {
          await supabase.from('likes').insert({
            from_user: user.id,
            to_user: current.id,
          });
          setLikedIds((prev) => new Set(prev).add(current.id));
          await refresh();
        }

        advanceCard();
      } catch {
        setError('Une erreur est survenue');
        setSwipeDir(null);
      } finally {
        setActionLoading(false);
      }
    },
    [user, current, actionLoading, likesExhausted, refresh, advanceCard]
  );

  const handleFlash = useCallback(async () => {
    if (!user || !current || actionLoading || alreadyFlashed) return;

    setActionLoading(true);
    setError(null);

    try {
      const result = await sendFlash(current.id);

      if (!result.ok) {
        setError(flashErrorMessage(result.error));
        return;
      }

      setFlashedIds((prev) => new Set(prev).add(current.id));
      setToast(
        result.already_flashed
          ? 'Vous avez déjà flashé ce profil'
          : `Coup de cœur envoyé à ${current.display_name} ✨`
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
      setError('Impossible d’envoyer le coup de cœur');
    } finally {
      setActionLoading(false);
    }
  }, [user, current, actionLoading, alreadyFlashed]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
          <div className="text-gray-400 text-sm">Chargement des profils...</div>
        </div>
      </div>
    );
  }

  if (error && !current) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 text-red-700 text-sm max-w-md">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (candidates.length === 0 || currentIndex >= candidates.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center gap-4">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-50 to-amber-50 flex items-center justify-center">
          <Heart className="w-9 h-9 text-rose-300" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">
          C'est tout pour le moment
        </h2>
        <p className="text-gray-500 max-w-sm">
          Vous avez vu tous les profils compatibles. Revenez plus tard pour
          découvrir de nouvelles personnes !
        </p>
        {!status.can_use_advanced_filters && (
          <div className="w-full max-w-sm">
            <SoftPremiumBanner
              title="Affiner vos rencontres"
              description={`Les filtres par ville et centres d’intérêt sont inclus avec Premium (${priceLabel}) — sans toucher au gratuit de base.`}
              priceLabel={priceLabel}
            />
          </div>
        )}
      </div>
    );
  }

  const swipeClass =
    swipeDir === 'right'
      ? 'animate-slideOutRight'
      : swipeDir === 'left'
        ? 'animate-slideOutLeft'
        : 'animate-fadeIn';

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-4">
      <AdvancedFiltersTeaser
        locked={!status.can_use_advanced_filters}
        onAskPremium={() => setShowFiltersHint(true)}
        priceLabel={priceLabel}
      />

      {status.can_use_advanced_filters && (
        <div className="rounded-2xl border border-rose-100 bg-white p-3 space-y-2.5">
          <p className="text-xs font-semibold text-rose-700 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Suggestions ciblées
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={sameCityOnly}
              onChange={(e) => setSameCityOnly(e.target.checked)}
              className="rounded border-gray-300 text-rose-500 focus:ring-rose-400"
            />
            Même ville uniquement
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            Centres d’intérêt en commun (min.)
            <select
              value={minOverlap}
              onChange={(e) => setMinOverlap(Number(e.target.value))}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-rose-300"
            >
              <option value={0}>Tous</option>
              <option value={1}>Au moins 1</option>
              <option value={2}>Au moins 2</option>
              <option value={3}>Au moins 3</option>
            </select>
          </label>
        </div>
      )}

      {showFiltersHint && !status.can_use_advanced_filters && (
        <SoftPremiumBanner
          title="Filtres avancés"
          description={`Ville, centres d’intérêt et affinage : disponibles avec Premium (${priceLabel}). La navigation de base reste libre.`}
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

      <div className="relative">
        <div
          key={current.id}
          className={`bg-white rounded-3xl shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden ${swipeClass}`}
        >
          <div className="relative h-80 bg-gradient-to-br from-rose-100 to-amber-100">
            {current.photo_url ? (
              <img
                src={current.photo_url}
                alt={current.display_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-24 h-24 rounded-full bg-white/40 flex items-center justify-center">
                  <span className="text-4xl font-bold text-white/80">
                    {current.display_name.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            )}

            <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm text-white text-sm font-semibold">
              {current.age} ans
            </div>

            {(current.is_boosted || current.is_founder) && (
              <div className="absolute top-4 left-4 flex flex-col gap-1.5 items-start">
                {current.is_boosted && <BoostedBadge size="sm" />}
                {current.is_founder && (
                  <FounderBadge number={current.founder_number} size="sm" />
                )}
              </div>
            )}
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between mb-2 gap-2">
              <h2 className="text-xl font-bold text-gray-900">
                {current.display_name}
              </h2>
              {current.location && (
                <span className="flex items-center gap-1 text-sm text-gray-500 shrink-0">
                  <MapPin className="w-4 h-4" />
                  {current.location}
                </span>
              )}
            </div>

            {(current.mutual_interests.length > 0 || current.same_city) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
                {current.mutual_interests.length > 0 && (
                  <span className="flex items-center gap-1.5 text-sm text-amber-600 font-semibold">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    {current.mutual_interests.length} centre
                    {current.mutual_interests.length > 1 ? 's' : ''} d'intérêt en
                    commun
                  </span>
                )}
                {current.same_city && (
                  <span className="text-sm text-rose-600 font-semibold">
                    Même ville
                  </span>
                )}
              </div>
            )}

            {current.bio && (
              <p className="text-gray-600 text-sm leading-relaxed mb-3">
                {current.bio}
              </p>
            )}

            {current.interests.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {current.interests.map((interest) => {
                  const mutual = current.mutual_interests.includes(interest);
                  return (
                    <span
                      key={interest}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        mutual
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {interest}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center gap-5 mt-6">
          <button
            type="button"
            onClick={() => handleAction(false)}
            disabled={actionLoading}
            className="w-14 h-14 rounded-full bg-white shadow-lg shadow-gray-200 border border-gray-200 flex items-center justify-center hover:scale-110 hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
            title="Passer"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>

          <button
            type="button"
            onClick={() => void handleFlash()}
            disabled={actionLoading || alreadyFlashed}
            className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 shadow-lg shadow-amber-200 flex items-center justify-center hover:scale-110 active:scale-95 transition-all disabled:opacity-50"
            title={
              alreadyFlashed
                ? 'Déjà flashé'
                : 'Envoyer un coup de cœur'
            }
          >
            <Zap className="w-7 h-7 text-white" fill="white" />
          </button>

          <button
            type="button"
            onClick={() => handleAction(true)}
            disabled={actionLoading || likesExhausted}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 shadow-lg shadow-rose-200 flex items-center justify-center hover:scale-110 active:scale-95 transition-all disabled:opacity-50"
            title={
              likesExhausted
                ? 'Limite de likes atteinte'
                : 'Liker ce profil'
            }
          >
            <Heart className="w-6 h-6 text-white" fill="white" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <p className="text-center text-xs text-gray-400">
            {currentIndex + 1} sur {candidates.length} · classés par affinité
          </p>
          <p className="text-center text-xs text-amber-700/80">
            <Zap className="w-3 h-3 inline mb-0.5" /> Coup de cœur : notifie la
            personne (3 / jour en gratuit)
          </p>
          <LikesQuotaHint status={status} />
        </div>
      </div>
    </div>
  );
}
