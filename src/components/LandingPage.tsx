import { Gift, Heart, Sparkles, Zap, UserRound } from 'lucide-react';
import { BrandLockup } from '@/components/BrandLockup';
import { LegalLink } from '@/components/LegalTerms';

const FOUNDER_SUBTITLE =
  '6 mois offerts — Offre exclusive réservée aux 500 premiers membres.';

const OFFERS = [
  {
    id: 'founder',
    title: 'Membre Fondateur',
    badge: 'Offre limitée',
    description: FOUNDER_SUBTITLE,
    point: 'Inscription sans carte bancaire',
    accent: 'founder' as const,
  },
  {
    id: 'premium',
    title: 'Offre Premium',
    description:
      '19,99 € / mois pour un confort d’utilisation, sans engagement.',
    accent: 'premium' as const,
  },
  {
    id: 'boost',
    title: 'Boost 24h',
    description: 'Visibilité maximale.',
    accent: 'boost' as const,
  },
  {
    id: 'freemium',
    title: 'Offre Freemium',
    description: 'Notre offre standard gratuite.',
    accent: 'freemium' as const,
  },
] as const;

export function SiteHeader({
  displayName,
  onAuthClick,
  onSignOut,
  onLogoClick,
}: {
  displayName?: string | null;
  onAuthClick?: () => void;
  onSignOut?: () => void;
  onLogoClick?: () => void;
}) {
  const connected = Boolean(displayName);

  return (
    <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-rose-100/80">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onLogoClick?.();
            if (window.location.pathname !== '/') {
              window.history.pushState({}, '', '/');
            }
          }}
          className="flex items-center gap-2.5 min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2"
          aria-label="Accueil Aypik"
        >
          <div className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center shadow-sm">
            <Heart className="w-4 h-4 text-white" fill="white" />
          </div>
          <BrandLockup />
        </a>

        <div className="shrink-0">
          {connected ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 max-w-[9rem] sm:max-w-[12rem] truncate text-sm font-semibold text-gray-800">
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
          ) : (
            <button
              type="button"
              onClick={onAuthClick}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white text-sm font-semibold shadow-md shadow-rose-200/60 hover:opacity-95 transition-opacity"
            >
              Connexion / Inscription
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function OfferCard({
  title,
  badge,
  description,
  point,
  accent,
}: {
  title: string;
  badge?: string;
  description: string;
  point?: string;
  accent: 'founder' | 'premium' | 'boost' | 'freemium';
}) {
  const shell =
    accent === 'founder'
      ? 'border-amber-300 bg-gradient-to-br from-amber-400 via-amber-300 to-rose-300'
      : accent === 'premium'
        ? 'border-rose-200 bg-white'
        : accent === 'boost'
          ? 'border-amber-200 bg-white'
          : 'border-gray-200 bg-white';

  const titleColor =
    accent === 'founder' ? 'text-amber-950' : 'text-gray-900';
  const bodyColor =
    accent === 'founder' ? 'text-amber-950/85' : 'text-gray-600';

  const Icon =
    accent === 'founder'
      ? Gift
      : accent === 'premium'
        ? Sparkles
        : accent === 'boost'
          ? Zap
          : Heart;

  return (
    <article
      className={`relative overflow-hidden rounded-3xl border-2 p-5 sm:p-6 ${shell} animate-fadeIn`}
    >
      {accent === 'founder' && (
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(255,255,255,0.85) 0%, transparent 45%), radial-gradient(circle at 88% 10%, rgba(255,255,255,0.55) 0%, transparent 40%)',
          }}
        />
      )}
      <div className="relative space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {badge && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900 border border-white/80 shadow-sm">
              <Gift className="w-3.5 h-3.5" />
              {badge}
            </span>
          )}
          {accent !== 'founder' && (
            <span
              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                accent === 'premium'
                  ? 'bg-rose-50 text-rose-500'
                  : accent === 'boost'
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-gray-100 text-rose-400'
              }`}
            >
              <Icon className="w-4 h-4" />
            </span>
          )}
        </div>
        <h3 className={`text-xl font-extrabold tracking-tight ${titleColor}`}>
          {title}
        </h3>
        <p className={`text-sm sm:text-base font-medium leading-snug ${bodyColor}`}>
          {description}
        </p>
        {point && (
          <p
            className={`flex items-center gap-2 text-sm font-semibold ${
              accent === 'founder' ? 'text-amber-950' : 'text-gray-800'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full ${
                accent === 'founder' ? 'bg-white/80' : 'bg-rose-50'
              }`}
            >
              ✓
            </span>
            {point}
          </p>
        )}
      </div>
    </article>
  );
}

export default function LandingPage({
  displayName,
  onAuthClick,
  onSignOut,
  onLogoClick,
  onPrimaryCta,
}: {
  displayName?: string | null;
  onAuthClick?: () => void;
  onSignOut?: () => void;
  onLogoClick?: () => void;
  /** CTA principal (ex. aller aux matchs si déjà connecté) */
  onPrimaryCta?: () => void;
}) {
  const connected = Boolean(displayName);

  return (
    <div className="min-h-full flex flex-col bg-[#fff8f5]">
      <SiteHeader
        displayName={displayName}
        onAuthClick={onAuthClick}
        onSignOut={onSignOut}
        onLogoClick={onLogoClick}
      />

      {/* Hero / Philosophie — une composition, brand first */}
      <section className="relative isolate overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 90% 70% at 50% -10%, rgba(251,113,133,0.35), transparent 55%), radial-gradient(ellipse 70% 50% at 100% 40%, rgba(251,191,36,0.22), transparent 50%), linear-gradient(180deg, #fff5f2 0%, #fffaf7 45%, #fff8f5 100%)',
          }}
        />
        <div className="max-w-3xl mx-auto px-4 pt-14 pb-16 sm:pt-20 sm:pb-20 text-center">
          <h1 className="max-w-xl sm:max-w-2xl mx-auto text-3xl sm:text-4xl md:text-[2.75rem] font-extrabold text-gray-900 tracking-tight leading-[1.2] text-balance animate-pop">
            Un espace bienveillant réservé exclusivement aux personnes{' '}
            <span className="whitespace-nowrap">sans enfants.</span>
          </h1>

          {/* Signature de marque sous l’accroche */}
          <div className="mt-8 flex flex-col items-center gap-3 animate-fadeIn">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-200/70">
              <Heart className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="white" />
            </div>
            <p
              className="text-xl sm:text-2xl font-extrabold uppercase tracking-[0.32em] bg-gradient-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent"
              aria-label="Aypik"
            >
              Aypik
            </p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 animate-fadeIn">
            <button
              type="button"
              onClick={connected ? onPrimaryCta : onAuthClick}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200/70 hover:opacity-95 transition-opacity"
            >
              {connected ? 'Voir mes matchs' : 'Rejoindre Aypik'}
            </button>
            {!connected && (
              <button
                type="button"
                onClick={onAuthClick}
                className="w-full sm:w-auto px-7 py-3.5 rounded-2xl border border-rose-200 bg-white/70 text-gray-800 font-semibold hover:bg-white transition-colors"
              >
                Se connecter
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Offres */}
      <section className="max-w-3xl mx-auto w-full px-4 pb-16 sm:pb-20">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Nos offres
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Une entrée libre, des options pour aller plus loin.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {OFFERS.map((offer) => (
            <OfferCard key={offer.id} {...offer} />
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-rose-100/80 bg-white/60">
        <div className="max-w-3xl mx-auto px-4 py-6 text-center text-xs text-gray-400 leading-relaxed">
          Aypik ·{' '}
          <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors">
            CGU / CGV
          </LegalLink>
        </div>
      </footer>
    </div>
  );
}
