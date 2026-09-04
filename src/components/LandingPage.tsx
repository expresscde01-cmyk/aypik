import { useState, useEffect, useRef, type PointerEvent } from 'react';
import { Gift, Heart, HeartHandshake, LogOut, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { BrandHeaderBrand, BrandMark, BRAND_GRADIENT_CSS } from '@/components/BrandLockup';
import { SiteFooter } from '@/components/LegalTerms';
import TestimonialsSection from '@/components/testimonials/TestimonialsSection';
import {
  HeaderTaglineWidthProbe,
  useHeaderTaglineCompact,
} from '@/lib/useHeaderTaglineCompact';
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
    title: 'Sécurité & Authenticité',
    description:
      'Chaque profil est authentifié pour bâtir une communauté de confiance.',
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

const HERO_LOUPE_SIZE = 128;
const HERO_LOUPE_MAG = 2.7;

const HERO_TITLE_GRADIENT =
  'linear-gradient(to right, #F9C8D0, #E94375, #D32F2F, #1E88E5, #0D47A1)';

/** Phrase entre grands crochets, comme sur le visuel d’accueil. */
function HeroChildFreeStamp() {
  const stageRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [loupe, setLoupe] = useState({
    on: false,
    lensX: 0,
    lensY: 0,
    cloneX: 0,
    cloneY: 0,
    fontSize: 13,
  });

  const moveLoupe = (event: PointerEvent<HTMLDivElement>) => {
    const text = textRef.current;
    const stage = stageRef.current;
    if (!text || !stage) return;
    const textBox = text.getBoundingClientRect();
    const stageBox = stage.getBoundingClientRect();
    const tx = event.clientX - textBox.left;
    const ty = event.clientY - textBox.top;
    setLoupe({
      on: true,
      lensX: event.clientX - stageBox.left,
      lensY: event.clientY - stageBox.top,
      cloneX: HERO_LOUPE_SIZE / 2 - tx * HERO_LOUPE_MAG,
      cloneY: HERO_LOUPE_SIZE / 2 - ty * HERO_LOUPE_MAG,
      fontSize: parseFloat(getComputedStyle(text).fontSize),
    });
  };

  const hideLoupe = () => setLoupe((prev) => ({ ...prev, on: false }));

  return (
    <div className="hero-childfree-wrap">
      <div className="hero-childfree-line" role="img" aria-label={HERO_CHILD_FREE_PHRASE}>
        <span aria-hidden className="hero-childfree-bracket hero-childfree-bracket--open">[</span>
        <div
          ref={stageRef}
          className={`hero-loupe${loupe.on ? ' is-on' : ''}`}
          onPointerEnter={moveLoupe}
          onPointerMove={moveLoupe}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            moveLoupe(event);
          }}
          onTouchStart={(event) => {
            event.preventDefault();
          }}
          onPointerUp={(event) => {
            if (event.pointerType !== 'mouse') hideLoupe();
          }}
          onPointerCancel={hideLoupe}
          onPointerLeave={hideLoupe}
        >
          <p ref={textRef} className="hero-childfree-phrase">
            {HERO_CHILD_FREE_PHRASE}
          </p>
          <div
            className="hero-loupe-lens"
            aria-hidden
            style={{
              left: loupe.lensX,
              top: loupe.lensY,
            }}
          >
            <div className="hero-loupe-falloff">
              <p
                className="hero-loupe-clone"
                style={{
                  fontSize: `${loupe.fontSize * HERO_LOUPE_MAG}px`,
                  transform: `translate(${loupe.cloneX}px, ${loupe.cloneY}px)`,
                }}
              >
                {HERO_CHILD_FREE_PHRASE}
              </p>
            </div>
          </div>
        </div>
        <span aria-hidden className="hero-childfree-bracket hero-childfree-bracket--close">]</span>
      </div>
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
  const { compact: taglineCompact, rowRef, rightRef, probeRef } =
    useHeaderTaglineCompact();
  /** Même bascule que le header de l’app : largeur alignée à partir de 1024px. */
  const [pcHeader, setPcHeader] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setPcHeader(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return (
    <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-rose-100/80">
      <div className={pcHeader ? 'w-full px-8' : 'max-w-3xl mx-auto px-4'}>
        <div className={pcHeader ? 'max-w-7xl mx-auto' : undefined}>
        <div
          ref={rowRef}
          className="relative flex w-full items-start sm:items-center justify-between gap-2 sm:gap-3 pt-2.5 pb-2.5 sm:h-14 sm:py-0"
        >
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onLogoClick?.();
              if (window.location.pathname !== '/') {
                window.history.pushState({}, '', '/');
              }
            }}
            className="inline-flex flex-nowrap items-center min-w-0 max-w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2"
            aria-label="Accueil Aypik"
          >
            <BrandHeaderBrand compact={taglineCompact} />
          </a>

          <div ref={rightRef} className="shrink-0">
            {connected ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 max-w-[9rem] sm:max-w-[12rem] truncate text-sm font-semibold text-gray-800">
                  <UserRound className="w-4 h-4 text-rose-500 shrink-0" />
                  {displayName}
                </span>
                {onSignOut && (
                  <>
                    <span
                      className="w-px h-4 bg-gray-200 mx-0.5 shrink-0"
                      aria-hidden
                    />
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors whitespace-nowrap shrink-0"
                    >
                      <LogOut className="w-4 h-4" aria-hidden />
                      Déconnexion
                    </button>
                  </>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onAuthClick?.('signup')}
                className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white text-xs sm:text-sm font-semibold shadow-md shadow-rose-200/60 hover:opacity-95 transition-opacity"
              >
                Connexion / Inscription
              </button>
            )}
          </div>
          <HeaderTaglineWidthProbe probeRef={probeRef} />
        </div>
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
      <section className="hero-section relative isolate overflow-x-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 90% 70% at 50% -10%, rgba(251,113,133,0.35), transparent 55%), radial-gradient(ellipse 70% 50% at 100% 40%, rgba(251,191,36,0.22), transparent 50%), linear-gradient(180deg, #fff5f2 0%, #fffaf7 45%, #fff8f5 100%)',
          }}
        />
        <div className="max-w-3xl mx-auto px-4 pt-14 pb-16 sm:pt-20 sm:pb-20 text-center">
          <div className="hero-headline-stack">
            <h1
              className="hero-headline text-4xl sm:text-5xl md:text-[3.25rem] font-extrabold tracking-tight leading-[1.25] pb-1 animate-pop bg-clip-text text-transparent"
              style={{ backgroundImage: HERO_TITLE_GRADIENT }}
            >
              Un espace de rencontre
              <br />
              atypique
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

      {!SITE_FREE_MODE && <TestimonialsSection variant="landing" />}

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
