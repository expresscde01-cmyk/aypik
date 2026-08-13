import { useState, useEffect } from 'react';
import { Heart, MapPin, AlertCircle, MessageCircle, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  ageFromBirthDate,
  isWithinAgeGap,
  latestBirthDateForAge,
  minPartnerAge,
} from '@/lib/dating';
import { useMembership } from '@/lib/useMembership';
import type { Profile } from '@/components/ProfileSetup';
import { FounderBadge, BoostedBadge } from '@/components/membership/Badges';
import { WhoLikedTeaser } from '@/components/membership/PremiumTeasers';
import { SoftPremiumBanner } from '@/components/membership/SoftPremium';
import { SITE_FREE_MODE, offerLabel } from '@/lib/founderCopy';
import { formatPremiumPriceLabel } from '@/lib/membership';
import ChatScreen from '@/components/ChatScreen';

interface Match {
  profile: Profile;
  age: number;
  matched_at: string;
  is_founder?: boolean;
  founder_number?: number | null;
  is_boosted?: boolean;
}

export default function MatchesPage() {
  const { user } = useAuth();
  const { status } = useMembership();
  const [matches, setMatches] = useState<Match[]>([]);
  const [incomingLikeCount, setIncomingLikeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatPeer, setChatPeer] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const { data: meRow } = await supabase
          .from('profiles')
          .select('birth_date')
          .eq('id', user.id)
          .maybeSingle();

        const myAge = meRow?.birth_date
          ? ageFromBirthDate(meRow.birth_date as string)
          : null;
        const myMinAge = typeof myAge === 'number' ? minPartnerAge(myAge) : null;

        const { data: sentLikes, error: sentErr } = await supabase
          .from('likes')
          .select('to_user, created_at')
          .eq('from_user', user.id);

        if (sentErr) throw sentErr;

        const { data: allReceived } = await supabase
          .from('likes')
          .select('from_user')
          .eq('to_user', user.id);

        const sentSet = new Set((sentLikes || []).map((l) => l.to_user));
        const incomingOnly = (allReceived || []).filter(
          (l) => !sentSet.has(l.from_user)
        );
        setIncomingLikeCount(incomingOnly.length);

        if (!sentLikes || sentLikes.length === 0) {
          setLoading(false);
          return;
        }

        const targetIds = sentLikes.map((l) => l.to_user);
        const { data: receivedLikes, error: recvErr } = await supabase
          .from('likes')
          .select('from_user, created_at')
          .in('from_user', targetIds)
          .eq('to_user', user.id);

        if (recvErr) throw recvErr;
        if (!receivedLikes || receivedLikes.length === 0) {
          setLoading(false);
          return;
        }

        const sentMap = new Map(sentLikes.map((l) => [l.to_user, l.created_at]));
        const matchIds = receivedLikes.map((rl) => ({
          id: rl.from_user,
          matched_at: sentMap.get(rl.from_user) || rl.created_at,
        }));

        const matchIdList = matchIds.map((m) => m.id);
        const { data: profiles, error: profErr } = await supabase
          .from('profiles')
          .select('*')
          .in('id', matchIdList)
          .is('deletion_requested_at', null)
          .lte(
            'birth_date',
            myMinAge !== null
              ? latestBirthDateForAge(myMinAge)
              : '1900-01-01'
          );

        if (profErr) throw profErr;

        const founderMap = new Map<string, number | null>();
        const boostSet = new Set<string>();

        const { data: memberships } = await supabase
          .from('memberships')
          .select('user_id, is_founder, founder_number')
          .in('user_id', matchIdList);

        (memberships || []).forEach((m) => {
          if (m.is_founder) founderMap.set(m.user_id, m.founder_number ?? null);
        });

        const { data: boosts } = await supabase
          .from('profile_boosts')
          .select('user_id')
          .in('user_id', matchIdList)
          .in('payment_status', ['paid', 'simulated'])
          .gt('ends_at', new Date().toISOString());

        (boosts || []).forEach((b) => boostSet.add(b.user_id));

        const matchMap = new Map(matchIds.map((m) => [m.id, m.matched_at]));
        const matchList: Match[] = (profiles || [])
          .map((p) => ({
            profile: p as Profile,
            age: ageFromBirthDate((p as Profile).birth_date),
            matched_at: matchMap.get((p as Profile).id) || '',
            is_founder: founderMap.has((p as Profile).id),
            founder_number: founderMap.get((p as Profile).id) ?? null,
            is_boosted: boostSet.has((p as Profile).id),
          }))
          .filter((m) =>
            typeof myAge === 'number'
              ? isWithinAgeGap(myAge, m.age) && isWithinAgeGap(m.age, myAge)
              : false
          );

        setMatches(matchList);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

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

  const priceLabel = SITE_FREE_MODE
    ? undefined
    : formatPremiumPriceLabel(
        status.premium_price_cents,
        status.premium_currency,
        status.premium_interval
      );

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 text-red-700 text-sm max-w-md">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {!status.can_see_who_liked && (
          <WhoLikedTeaser
            locked
            count={incomingLikeCount}
            priceLabel={priceLabel}
            status={status}
          />
        )}
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
            Un match apparaît ici dès qu'on t'envoie un coup de cœur{' '}
            <Zap
              className="w-4 h-4 inline mb-0.5 text-amber-500"
              fill="currentColor"
              aria-hidden
            />
            , ou dès qu'un like{' '}
            <Heart
              className="w-4 h-4 inline mb-0.5 text-rose-500"
              fill="currentColor"
              aria-hidden
            />{' '}
            est réciproque.
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
        <ChatScreen peer={chatPeer} onClose={() => setChatPeer(null)} />
      )}

      <h2 className="text-xl font-bold text-gray-900 mb-1">
        Tes matchs ({matches.length})
      </h2>
      <p className="text-sm text-gray-500 mb-5">
        Match réciproque — messagerie libre et illimitée,
        c’est inclus dans {offerLabel(status)}
      </p>

      {!status.can_see_who_liked && (
        <div className="mb-5">
          <WhoLikedTeaser
            locked
            count={incomingLikeCount}
            priceLabel={priceLabel}
            status={status}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {matches.map((match) => (
          <div
            key={match.profile.id}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 hover:shadow-md hover:border-rose-100 transition-all animate-fadeIn"
          >
            <div className="w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-rose-100 to-amber-100 flex-shrink-0">
              {match.profile.photo_url ? (
                <img
                  src={match.profile.photo_url}
                  alt={match.profile.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg font-bold text-rose-400">
                  {match.profile.display_name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-gray-900 truncate">
                  {match.profile.display_name}
                </h3>
                <span className="text-sm text-gray-400">{match.age} ans</span>
                {match.is_boosted && <BoostedBadge size="sm" />}
                {match.is_founder && (
                  <FounderBadge number={match.founder_number} size="sm" />
                )}
              </div>
              {match.profile.location && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  {match.profile.location}
                </p>
              )}
              <p className="text-xs text-rose-500 flex items-center gap-1 mt-1">
                <Heart className="w-3 h-3" fill="currentColor" />
                Match{' '}
                {new Date(match.matched_at).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setChatPeer(match.profile)}
              className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center hover:bg-rose-100 transition-colors flex-shrink-0"
              aria-label={`Envoyer un message à ${match.profile.display_name}`}
              title="Ouvrir la messagerie"
            >
              <MessageCircle className="w-5 h-5 text-rose-500" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
