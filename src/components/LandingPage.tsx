import { Gift, Heart, HeartHandshake, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { BrandLockup, BrandMark, BRAND_GRADIENT_CSS } from '@/components/BrandLockup';
import { SiteFooter } from '@/components/LegalTerms';
import {
  FOUNDER_BENEFIT_BOOST_FIRST_MONTH,
  FOUNDER_BENEFIT_NO_CARD,
  FOUNDER_BENEFIT_UNLIMITED_LIKES,
  FOUNDER_SLOTS_SUBTITLE,
  SITE_FREE_MODE,
} from '@/lib/founderCopy';

const VALUES = [
  {
    id: 'confiance',
    title: 'Confiance & Vérification',
    description:
      'Un espace sécurisé où chaque profil est authentifié.',
    Icon: ShieldCheck,
  },
  {
    id: 'bienveillance',
    title: 'Bienveillance & Respect',
    description:
      'Une communauté fondée sur la compréhension mutuelle et l’écoute.',
    Icon: HeartHandshake,
  },
  {
    id: 'vecu-commun',
    title: 'Un vécu commun',
    description:
      'Un environnement dédié au partage d’un même mode de vie ou d’un vécu commun.',
    Icon: Sparkles,
  },
] as const;

const FOUNDER_OFFER = {
  id: 'founder' as const,
  title: 'Membre Fondateur',
  badge: 'Offre limitée',
  description: FOUNDER_SLOTS_SUBTITLE,
  points: [
    FOUNDER_BENEFIT_NO_CARD,
    FOUNDER_BENEFIT_UNLIMITED_LIKES,
    FOUNDER_BENEFIT_BOOST_FIRST_MONTH,
  ],
  accent: 'founder' as const,
};

const PAID_OFFERS = [
  {
    id: 'premium' as const,
    title: 'Offre Premium',
    description:
      '19,99 € / mois pour un confort d’utilisation, sans engagement.',
    accent: 'premium' as const,
  },
  {
    id: 'boost' as const,
    title: 'Boost 24h',
    description: 'Visibilité maximale.',
    accent: 'boost' as const,
  },
  {
    id: 'freemium' as const,
    title: 'Offre Freemium',
    description: 'Notre offre standard gratuite.',
    accent: 'freemium' as const,
  },
];

const OFFERS = SITE_FREE_MODE ? [FOUNDER_OFFER] : [FOUNDER_OFFER, ...PAID_OFFERS];

const HERO_CHILD_FREE_PHRASE =
  'Réservé exclusivement aux personnes sans enfants';

const HERO_TITLE_GRADIENT =
  'linear-gradient(to right, #F9C8D0, #E94375, #D32F2F, #1E88E5, #0D47A1)';

/** Phrase droite, typo tampon, liseret arrondi, taches discrètes. */
function HeroChildFreeStamp() {
  return (
    <div className="stamp-ink-appear mt-[0.62em] w-[92%] mx-auto">
        <svg
          role="img"
          aria-label={HERO_CHILD_FREE_PHRASE}
          viewBox="0 0 640 116"
          className="h-auto w-full mix-blend-multiply select-none"
        >
          <title>{HERO_CHILD_FREE_PHRASE}</title>
          <defs>
            <filter
              id="aypik-stamp-ink"
              x="-8%"
              y="-28%"
              width="116%"
              height="156%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.62"
                numOctaves="3"
                seed="9"
                result="noise"
              />
              <feColorMatrix
                in="noise"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 3.6 -1.15"
                result="speckle"
              />
              <feComposite
                in="SourceGraphic"
                in2="speckle"
                operator="in"
                result="punched"
              />
              <feDisplacementMap
                in="punched"
                in2="noise"
                scale="0.7"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
          <g filter="url(#aypik-stamp-ink)" fill="currentColor" stroke="currentColor">
            <rect
              x="10"
              y="10"
              width="620"
              height="96"
              rx="16"
              ry="16"
              fill="none"
              strokeWidth="2.6"
            />
            <ellipse cx="22" cy="26" rx="2.6" ry="1.7" opacity="0.28" stroke="none" />
            <circle cx="618" cy="34" r="1.7" opacity="0.22" stroke="none" />
            <ellipse cx="36" cy="98" rx="2.2" ry="1.4" opacity="0.2" stroke="none" />
            <circle cx="604" cy="94" r="1.45" opacity="0.18" stroke="none" />
            <ellipse cx="320" cy="6" rx="1.8" ry="1.15" opacity="0.16" stroke="none" />
            <circle cx="214" cy="108" r="1.2" opacity="0.14" stroke="none" />
            <text
              x="320"
              y="50"
              textAnchor="middle"
              fill="currentColor"
              stroke="none"
              fontFamily="'Plus Jakarta Sans', 'Arial Black', sans-serif"
              fontWeight="800"
              fontSize="28"
              letterSpacing="3.4"
            >
              RÉSERVÉ EXCLUSIVEMENT
            </text>
            <text
              x="320"
              y="84"
              textAnchor="middle"
              fill="currentColor"
              stroke="none"
              fontFamily="'Plus Jakarta Sans', 'Arial Black', sans-serif"
              fontWeight="800"
              fontSize="21"
              letterSpacing="2.5"
            >
              AUX PERSONNES SANS ENFANTS
            </text>
          </g>
        </svg>
    </div>
  );
}

export function SiteHeader({
  displayName,
  onAuthClick,
  onSignOut,
  onLogoClick,
}: {
  displayName?: string | null;
  onAuthClick?: (mode?: 'signin' | 'signup') => void;
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
          <BrandMark size="sm" />
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
              onClick={() => onAuthClick?.('signup')}
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
  points,
  accent,
}: {
  title: string;
  badge?: string;
  description: string;
  point?: string;
  points?: readonly string[];
  accent: 'founder' | 'premium' | 'boost' | 'freemium';
}) {
  const items = points?.length ? points : point ? [point] : [];
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
          ? Sparkles
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
        {items.map((item) => (
          <p
            key={item}
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
            {item}
          </p>
        ))}
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
  onAuthClick?: (mode?: 'signin' | 'signup') => void;
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
          <div className="mx-auto flex w-fit max-w-full flex-col items-stretch text-4xl sm:text-5xl md:text-[3.25rem]">
            <h1
              className="text-center text-[1em] font-extrabold tracking-tight leading-[1.15] animate-pop bg-clip-text text-transparent"
              style={{ backgroundImage: HERO_TITLE_GRADIENT }}
            >
              Un espace de rencontre
              <br />
              bienveillant
            </h1>
            <HeroChildFreeStamp />
          </div>

          {/* Signature de marque sous l’accroche */}
          <div className="mt-8 flex flex-col items-center gap-3 animate-fadeIn">
            <BrandMark size="md" />
            <p
              className="w-fit mx-auto text-xl sm:text-2xl font-extrabold uppercase tracking-[0.32em] bg-clip-text text-transparent"
              style={{ backgroundImage: BRAND_GRADIENT_CSS }}
              aria-label="Aypik"
            >
              Aypik
            </p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 animate-fadeIn">
            <button
              type="button"
              onClick={connected ? onPrimaryCta : () => onAuthClick?.('signup')}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200/70 hover:opacity-95 transition-opacity"
            >
              {connected ? 'Voir mes matchs' : 'Rejoindre Aypik'}
            </button>
            {!connected && (
              <button
                type="button"
                onClick={() => onAuthClick?.('signin')}
                className="w-full sm:w-auto px-7 py-3.5 rounded-2xl border border-rose-200 bg-white/70 text-gray-800 font-semibold hover:bg-white transition-colors"
              >
                Se connecter
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Valeurs */}
      <section className="max-w-3xl mx-auto w-full px-4 pb-14 sm:pb-16">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Valeurs
          </h2>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            Les piliers d’une communauté transparente, sereine et respectueuse.
          </p>
        </div>
        <ul className="grid gap-8 sm:grid-cols-3 sm:gap-6">
          {VALUES.map(({ id, title, description, Icon }) => (
            <li key={id} className="text-center sm:text-left">
              <div className="mx-auto sm:mx-0 mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-md text-orange-500">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </div>
              <h3 className="text-base font-bold text-gray-900 tracking-tight leading-snug">
                {title}
              </h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed text-pretty">
                {description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Offres : Fondateur seul en mode gratuit ; Premium / Boost / Freemium si SITE_FREE_MODE === false */}
      <section className="max-w-3xl mx-auto w-full px-4 pb-16 sm:pb-20">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            {SITE_FREE_MODE ? 'Notre offre' : 'Nos offres'}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {SITE_FREE_MODE
              ? 'Une formule gratuite pendant 6 mois.'
              : 'Une entrée libre, des options pour aller plus loin.'}
          </p>
        </div>
        <div className={SITE_FREE_MODE ? 'max-w-md mx-auto' : 'grid gap-4 sm:grid-cols-2'}>
          {OFFERS.map((offer) => (
            <OfferCard
              key={offer.id}
              title={offer.title}
              badge={'badge' in offer ? offer.badge : undefined}
              description={offer.description}
              points={'points' in offer ? offer.points : undefined}
              accent={offer.accent}
            />
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
