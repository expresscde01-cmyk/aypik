import { Heart, MapPin, X, Zap } from 'lucide-react';
import { BoostedBadge, FounderBadge } from '@/components/membership/Badges';
import { geoProximityBadge } from '@/lib/geoProximity';

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

export default function ProfileDetailModal({
  candidate,
  alreadyFlashed,
  alreadyLiked,
  busy,
  likesExhausted,
  showFlashCta,
  onClose,
  onLike,
  onFlash,
  onSkip,
}: {
  candidate: ProfileDetailCandidate;
  alreadyFlashed: boolean;
  alreadyLiked: boolean;
  busy: boolean;
  likesExhausted: boolean;
  showFlashCta: boolean;
  onClose: () => void;
  onLike: () => void;
  onFlash: () => void;
  onSkip: () => void;
}) {
  const interests = candidate.interests || [];
  const mutual = new Set(candidate.mutual_interests || []);
  const geoBadge = geoProximityBadge(candidate);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
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
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rose-100 max-h-[92vh] overflow-y-auto animate-fadeIn">
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
          {(candidate.is_boosted || candidate.is_founder) && (
            <div className="absolute bottom-3 left-3 flex flex-col gap-1 items-start pointer-events-none">
              {candidate.is_boosted && <BoostedBadge size="sm" />}
              {candidate.is_founder && (
                <FounderBadge number={candidate.founder_number} size="sm" />
              )}
            </div>
          )}
        </div>

        <div className="px-5 pt-4 pb-6 space-y-4">
          <div>
            <h2
              id="profile-detail-title"
              className="text-xl font-extrabold text-gray-900"
            >
              {candidate.display_name}
            </h2>
            {candidate.location && (
              <p className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                <MapPin className="w-4 h-4 shrink-0" />
                {candidate.location}
                {geoBadge ? (
                  <span className="ml-1 text-emerald-700 font-medium">
                    · {geoBadge}
                  </span>
                ) : null}
              </p>
            )}
          </div>

          {candidate.bio?.trim() ? (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {candidate.bio.trim()}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">Pas encore de bio.</p>
          )}

          {interests.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Centres d’intérêt
              </p>
              <div className="flex flex-wrap gap-1.5">
                {interests.map((interest) => {
                  const shared = mutual.has(interest);
                  return (
                    <span
                      key={interest}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        shared
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-gray-50 text-gray-600 border border-gray-200'
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

          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={onSkip}
              className="w-12 h-12 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50 cursor-pointer"
              title="Masquer"
              aria-label={`Masquer ${candidate.display_name}`}
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
            {showFlashCta && (
              <button
                type="button"
                onClick={onFlash}
                disabled={busy || alreadyFlashed}
                className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                title={
                  alreadyFlashed ? 'Déjà flashé' : 'Envoyer un coup de cœur'
                }
                aria-label={
                  alreadyFlashed
                    ? `Déjà flashé ${candidate.display_name}`
                    : `Coup de cœur pour ${candidate.display_name}`
                }
              >
                <Zap className="w-5 h-5 text-white" fill="white" />
              </button>
            )}
            <button
              type="button"
              onClick={onLike}
              disabled={busy || likesExhausted || alreadyLiked}
              className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
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
              <Heart className="w-6 h-6 text-white" fill="white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
