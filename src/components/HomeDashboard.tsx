import { useEffect, useState } from 'react';
import {
  Compass,
  Heart,
  MapPin,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { BrandLockup, BrandMark, BRAND_GRADIENT_CSS } from '@/components/BrandLockup';
import NotificationsBell from '@/components/NotificationsBell';
import {
  fetchSuggestedProfiles,
  type SuggestedProfile,
} from '@/lib/suggestions';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/components/ProfileSetup';

export default function HomeDashboard({
  displayName,
  onSignOut,
  onOpenDiscover,
  onOpenMatches,
  onOpenProfile,
}: {
  displayName: string;
  onSignOut?: () => void;
  onOpenDiscover: () => void;
  onOpenMatches: () => void;
  onOpenProfile: () => void;
}) {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<SuggestedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const { data: me } = await supabase
          .from('profiles')
          .select('interests')
          .eq('id', user.id)
          .maybeSingle();

        const list = await fetchSuggestedProfiles({
          limit: 8,
          myInterests: ((me as Profile | null)?.interests || []) as string[],
        });
        if (active) {
          setSuggestions(list);
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

  return (
    <div className="min-h-full flex flex-col bg-[#fff8f5]">
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-rose-100/80">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark size="sm" />
            <BrandLockup />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <NotificationsBell />
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
            Des profils proches de vous, de votre âge et de vos centres
            d’intérêt — sélectionnés pour vous.
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
              onClick={onOpenMatches}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl border border-rose-200 bg-white/80 text-gray-800 font-semibold hover:bg-white transition-colors"
            >
              <Heart className="w-4 h-4 text-rose-500" />
              Mes matchs
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">
                Suggestions pour vous
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Ville · âge · centres d’intérêt en commun
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

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-9 h-9 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
              {error}
            </p>
          ) : suggestions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-rose-200 bg-white/70 px-5 py-10 text-center">
              <Sparkles className="w-7 h-7 text-rose-300 mx-auto mb-2" />
              <p className="text-sm text-gray-600">
                Pas encore de suggestion. Complétez vos centres d’intérêt ou
                revenez bientôt.
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
              {suggestions.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={onOpenDiscover}
                    className="w-full text-left rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-rose-100 transition-all animate-fadeIn"
                  >
                    <div className="aspect-[4/5] bg-gradient-to-br from-rose-100 to-amber-100 relative">
                      {p.photo_url ? (
                        <img
                          src={p.photo_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white/80">
                          {p.display_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/40 text-white text-[11px] font-semibold backdrop-blur-sm">
                        {p.age} ans
                      </span>
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
                        <p className="flex items-center gap-1 text-[11px] text-amber-600 font-semibold">
                          <Sparkles className="w-3 h-3" />
                          {p.mutual_interest_count} en commun
                        </p>
                      )}
                      {(p.same_city || p.same_department) && (
                        <p className="text-[11px] text-rose-600 font-medium">
                          {p.same_city ? 'Même ville' : 'Même département'}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
