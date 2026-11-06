import { useState, useEffect, useRef, type ReactNode } from 'react';
import { ChevronDown, Gift, Heart, HeartHandshake, LogOut, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { BrandHeaderBrand } from '@/components/BrandLockup';
import { SiteFooter } from '@/components/LegalChrome';
import LaunchTicker from '@/components/LaunchTicker';
import { OfferSummaryCards } from '@/components/membership/OfferSummaryCards';
import TestimonialsSection from '@/components/testimonials/TestimonialsSection';
import {
  HeaderTaglineWidthProbe,
  MobileTaglineWidthProbe,
  useHeaderTaglineCompact,
  useMobileTaglineFits,
} from '@/lib/useHeaderTaglineCompact';
import {
  SITE_FREE_MODE,
  founderBenefitBoostFirstMonth,
  founderBenefitNoCard,
  founderBenefitUnlimitedLikes,
  founderOfferClosedShort,
  founderOfferShortMessage,
} from '@/lib/founderCopy';
import { useFounderSlots } from '@/lib/useFounderSlots';
import LanguageSwitcher from '@/i18n/LanguageSwitcher';
import { useTranslation } from 'react-i18next';
import { currentLocale } from '@/i18n/documentMeta';
import { withLocalePrefix } from '@/i18n/path';
import { HeroTitleTrailDesktop, HeroTitleTrailMobile } from '@/components/HeroTitleTrail';
import { FounderPrivilegeHighlight } from '@/components/FounderPrivilegeHighlight';

/** Sillage décoratif du titre hero, calé sur le français. false le retire. */
const SHOW_TITLE_TRAIL = true;

const VALUE_ICONS = {
  confiance: ShieldCheck,
  bienveillance: HeartHandshake,
  'vecu-commun': Sparkles,
} as const;

const HERO_SPARKS = [
  { x: '0px', y: '-74px', color: '#E8395F' },
  { x: '52px', y: '-52px', color: '#FFFFFF' },
  { x: '76px', y: '0px', color: '#FFB3C1' },
  { x: '48px', y: '58px', color: '#E8395F' },
  { x: '0px', y: '68px', color: '#FFFFFF' },
  { x: '-50px', y: '56px', color: '#FFB3C1' },
  { x: '-74px', y: '4px', color: '#E8395F' },
  { x: '-46px', y: '-62px', color: '#FFFFFF' },
] as const;

const HERO_HEART_WEBP = '/aypik-coeur-hero.webp?v=6';
const HERO_HEART_PNG = '/aypik-coeur-hero.png?v=6';

/** Cœur brillant du hero : WebP, PNG en secours. Même fichier pour le repos et les deux moitiés. */
function HeroHeartFrame({ className }: { className: string }) {
  return (
    <picture className={className}>
      <source srcSet={HERO_HEART_WEBP} type="image/webp" />
      <img
        src={HERO_HEART_PNG}
        alt=""
        width={1164}
        height={1026}
        draggable={false}
      />
    </picture>
  );
}

/** Cœur du hero : le logo déjà affiché s’ouvre et laisse sortir la phrase. */
function HeroHeart() {
  const { t } = useTranslation();
  const lineMark = t('landing.heroChildFreeMark');
  const lineRest = t('landing.heroChildFreeLine1Rest');
  const line2 = t('landing.heroChildFreeLine2');
  const [open, setOpen] = useState(false);
  const enteredAt = useRef(0);

  const openHeart = () => {
    enteredAt.current = performance.now();
    setOpen(true);
  };

  const onHeartClick = () => {
    if (performance.now() - enteredAt.current < 700) return;
    setOpen((current) => !current);
  };

  return (
    <div className={`hero-signature mt-6 flex flex-col items-center gap-3 animate-fadeIn${open ? ' is-open' : ''}`}>
      <div className={`hero-heart${open ? ' is-open' : ''}`}>
        <button
          type="button"
          className="hero-heart-btn"
          aria-expanded={open}
          onPointerEnter={openHeart}
          onPointerLeave={() => setOpen(false)}
          onClick={onHeartClick}
        >
          <p className="hero-heart-badge">
            <span className="hero-heart-badge-line">
              <span className="hl">{lineMark}</span><span className="hero-heart-badge-rest"> {lineRest}</span>
            </span>{' '}
            <span className="hero-heart-badge-line hero-heart-badge-line--nowrap">{line2}</span>
          </p>
          <span className="hero-heart-visual">
            {HERO_SPARKS.map((spark) => (
              <span
                key={`${spark.x}${spark.y}`}
                className="hero-heart-spark"
                style={{
                  ['--x' as string]: spark.x,
                  ['--y' as string]: spark.y,
                  ['--spark' as string]: spark.color,
                }}
              />
            ))}
            <HeroHeartFrame className="hero-heart-half hero-heart-half--left" />
            <HeroHeartFrame className="hero-heart-half hero-heart-half--right" />
            <HeroHeartFrame className="hero-heart-whole" />
          </span>
        </button>
      </div>
      <img
        src="/aypik-nom.svg?v=1"
        alt="Aypik"
        width={3464}
        height={722}
        draggable={false}
        className="hero-wordmark"
      />
      <p className="hero-heart-hint hero-heart-hint--mouse">{t('landing.heroHeartHintMouse')}</p>
      <p className="hero-heart-hint hero-heart-hint--touch">{t('landing.heroHeartHintTouch')}</p>
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
  const {
    fits: mobileTaglineFits,
    rowRef: mobileTaglineRowRef,
    rightRef: mobileTaglineRightRef,
    probeRef: mobileTaglineProbeRef,
  } = useMobileTaglineFits();
  const { t } = useTranslation();
  const homeHref = withLocalePrefix(currentLocale(), '/');
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
    <div className="sticky top-0 z-20">
    <header className="bg-white/85 backdrop-blur-md border-b border-aypik-border">
      <div className={pcHeader ? 'w-full px-8' : 'max-w-3xl mx-auto px-4'}>
        <div className={pcHeader ? 'max-w-7xl mx-auto' : undefined}>
        <div
          ref={(node) => {
            rowRef.current = node;
            mobileTaglineRowRef.current = node;
          }}
          className={`relative flex w-full justify-between gap-2 sm:gap-3 pt-2.5 pb-2.5 sm:h-14 sm:py-0 ${
            !pcHeader && !mobileTaglineFits
              ? 'items-center'
              : 'items-start sm:items-center'
          }`}
        >
          <a
            href={homeHref}
            onClick={(e) => {
              e.preventDefault();
              onLogoClick?.();
              const path = window.location.pathname.replace(/\/+$/, '') || '/';
              const target = homeHref.replace(/\/+$/, '') || '/';
              if (path !== target) {
                window.history.pushState({}, '', homeHref);
              }
            }}
            className="inline-flex flex-nowrap items-center min-w-0 max-w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-aypik-navy/40 focus-visible:ring-offset-2"
            aria-label={t('common.homeAria')}
          >
            {pcHeader ? (
              <BrandHeaderBrand compact={taglineCompact} />
            ) : (
              <BrandHeaderBrand hideTagline={!mobileTaglineFits} />
            )}
          </a>

          <div
            ref={(node) => {
              rightRef.current = node;
              mobileTaglineRightRef.current = node;
            }}
            className="shrink-0 flex items-center gap-2"
          >
            <LanguageSwitcher compact />
            {connected ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 max-w-[9rem] sm:max-w-[12rem] truncate text-sm font-semibold text-gray-800">
                  <UserRound className="w-4 h-4 text-aypik-navy shrink-0" />
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
                      {t('common.signOutShort')}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onAuthClick?.('signup')}
                className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 btn-header text-xs sm:text-sm"
              >
                <span>{t('landing.headerAuth')}</span>
              </button>
            )}
          </div>
          <HeaderTaglineWidthProbe probeRef={probeRef} />
          <MobileTaglineWidthProbe probeRef={mobileTaglineProbeRef} />
        </div>
        </div>
      </div>
    </header>
    <LaunchTicker />
    </div>
  );
}

function founderLead(description: string): ReactNode {
  const sep = ' — ';
  const at = description.indexOf(sep);
  if (at <= 0) return description;
  return (
    <>
      <strong className="font-bold text-aypik-raspberry">{description.slice(0, at)}</strong>
      {description.slice(at)}
    </>
  );
}

function OfferCard({
  title,
  badge,
  description,
  point,
  points,
  highlight,
  accent,
}: {
  title: string;
  badge?: string;
  description: string;
  point?: string;
  points?: readonly string[];
  highlight?: ReactNode;
  accent: 'founder' | 'premium' | 'boost' | 'freemium';
}) {
  const items = points?.length ? points : point ? [point] : [];
  const shell =
    accent === 'founder'
      ? 'border-amber-300 bg-gradient-to-br from-amber-400 via-amber-300 to-rose-300'
      : accent === 'premium'
        ? 'border-aypik-border bg-white'
        : accent === 'boost'
          ? 'border-aypik-border bg-white'
          : 'border-gray-200 bg-white';
  const titleColor =
    accent === 'founder' ? 'text-aypik-raspberry' : 'text-gray-900';
  const bodyColor =
    accent === 'founder' ? 'text-aypik-navy' : 'text-gray-600';
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
            <span className="inline-flex items-center gap-1.5 rounded-full bg-aypik-raspberry px-3 py-1 text-xs font-bold uppercase tracking-wide text-white border border-aypik-raspberry">
              <Gift className="w-3.5 h-3.5" />
              {badge}
            </span>
          )}
          {accent !== 'founder' && (
            <span
              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                accent === 'premium'
                  ? 'bg-aypik-banner-bg text-aypik-navy'
                  : accent === 'boost'
                    ? 'bg-aypik-banner-bg text-aypik-navy'
                    : 'bg-gray-100 text-aypik-navy'
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
          {accent === 'founder' ? founderLead(description) : description}
        </p>
        {items.map((item) => (
          <p
            key={item}
            className={`flex items-center gap-2 text-sm font-semibold ${
              accent === 'founder' ? 'text-aypik-navy' : 'text-gray-800'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full ${
                accent === 'founder' ? 'bg-white text-aypik-raspberry' : 'bg-aypik-banner-bg'
              }`}
            >
              ✓
            </span>
            {item}
          </p>
        ))}
        {highlight ? (
          <p className="rounded-xl border-l-4 border-aypik-raspberry bg-white/85 px-3 py-2.5 text-sm sm:text-base font-normal text-aypik-navy leading-snug shadow-sm">
            {highlight}
          </p>
        ) : null}
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
  const { t, i18n } = useTranslation();
  const showTitleTrail = SHOW_TITLE_TRAIL && currentLocale() === 'fr';

  useEffect(() => {
    let alive = true;
    const applyHomeMeta = () => {
      window.setTimeout(() => {
        if (!alive) return;
        document.title = i18n.t('seo.homeTitle');
        const share = i18n.t('seo.homeMetaDescription');
        document
          .querySelector('meta[name="description"]')
          ?.setAttribute('content', share);
        document
          .querySelector('meta[property="og:description"]')
          ?.setAttribute('content', share);
        document
          .querySelector('meta[name="twitter:description"]')
          ?.setAttribute('content', share);
      }, 0);
    };
    applyHomeMeta();
    i18n.on('languageChanged', applyHomeMeta);
    return () => {
      alive = false;
      i18n.off('languageChanged', applyHomeMeta);
      document.title = i18n.t('seo.title');
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute('content', i18n.t('seo.metaDescription'));
      document
        .querySelector('meta[property="og:description"]')
        ?.setAttribute('content', i18n.t('seo.ogDescription'));
      document
        .querySelector('meta[name="twitter:description"]')
        ?.setAttribute('content', i18n.t('seo.twitterDescription'));
    };
  }, [i18n]);

  const { closed: founderOfferClosed } = useFounderSlots();
  const values = [
    {
      id: 'confiance' as const,
      title: t('landing.valueTrustTitle'),
      description: t('landing.valueTrustBody'),
      Icon: VALUE_ICONS.confiance,
    },
    {
      id: 'bienveillance' as const,
      title: t('landing.valueKindTitle'),
      description: t('landing.valueKindBody'),
      Icon: VALUE_ICONS.bienveillance,
    },
    {
      id: 'vecu-commun' as const,
      title: t('landing.valueSharedTitle'),
      description: t('landing.valueSharedBody'),
      Icon: VALUE_ICONS['vecu-commun'],
    },
  ];
  const founderOffer = founderOfferClosed
    ? {
        id: 'founder' as const,
        title: t('landing.founderTitle'),
        description: founderOfferClosedShort(),
        points: [] as const,
        accent: 'founder' as const,
      }
    : {
        id: 'founder' as const,
        title: t('landing.founderTitle'),
        badge: t('landing.founderBadge'),
        description: founderOfferShortMessage(false),
        points: [
          founderBenefitNoCard(),
          founderBenefitUnlimitedLikes(),
          founderBenefitBoostFirstMonth(),
        ],
        accent: 'founder' as const,
      };
  const offers = [founderOffer];

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
            backgroundImage:
              'linear-gradient(180deg, rgba(255,248,246,.50) 0%, rgba(255,248,246,.30) 45%, rgba(255,248,246,.85) 85%, #fff8f5 100%), url(/images/aypik-fond-ciel.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center 30%',
            backgroundRepeat: 'no-repeat',
          }}
        />
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-3 sm:pt-10 md:pt-20 sm:pb-4 text-center">
          <div className="hero-headline-stack">
            <h1 className="hero-headline font-extrabold tracking-tight pb-1 animate-pop">
              <span className="hero-headline-line1">
                {showTitleTrail ? (
                  <span className="hero-title-trail-host">
                    <span className="hero-title-trail-copy">
                      {t('landing.heroTitleBefore')}
                      <span className="hero-title-trail-unit">
                        <span className="hero-title-trail-unit-text">
                          <span className="hero-headline-accent accent-logo">
                            {t('landing.heroTitleAccent').replace(/ /g, '\u00A0')}
                          </span>
                          {t('landing.heroTitleMark')}
                        </span>
                        <HeroTitleTrailMobile />
                      </span>
                    </span>
                    <HeroTitleTrailDesktop />
                  </span>
                ) : (
                  <>
                    {t('landing.heroTitleBefore')}
                    <span className="whitespace-nowrap">
                      <span className="hero-headline-accent accent-logo">
                        {t('landing.heroTitleAccent').replace(/ /g, '\u00A0')}
                      </span>
                      {t('landing.heroTitleMark')}
                    </span>
                  </>
                )}
              </span>
              <span className="hero-headline-line2">{t('landing.heroTitleSub')}</span>
            </h1>
          </div>

          <HeroHeart />

          <p className="hero-meet">
            <span className="hero-meet-lead">{t('landing.heroMeetLead')}</span>
            <span className="hero-meet-sep" aria-hidden="true"> · </span>
            <span className="hero-meet-rest">{t('landing.heroMeetRest')}</span>
          </p>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 animate-fadeIn">
            <button
              type="button"
              onClick={connected ? onPrimaryCta : () => onAuthClick?.('signup')}
              className="w-full sm:w-auto px-7 py-3.5 btn-join"
            >
              <span>{connected ? t('landing.ctaMatches') : t('landing.ctaJoin')}</span>
            </button>
            {!connected && (
              <button
                type="button"
                onClick={() => onAuthClick?.('signin')}
                className="w-full sm:w-auto px-7 py-3.5 btn-secondary"
              >
                {t('landing.ctaSignIn')}
              </button>
            )}
          </div>

          <button
            type="button"
            className="hero-scroll-hint scroll-chevron"
            aria-label={t('landing.scrollToOfferAria')}
            onClick={() => {
              const reduce = window.matchMedia(
                '(prefers-reduced-motion: reduce)'
              ).matches;
              document.getElementById('landing-offer')?.scrollIntoView({
                behavior: reduce ? 'auto' : 'smooth',
                block: 'start',
              });
            }}
          >
            <ChevronDown className="hero-scroll-hint-icon" aria-hidden />
          </button>
        </div>
      </section>

      {/* Offres : Fondateur en lancement ; cartes + comparatif si SITE_FREE_MODE === false */}
      <section
        id="landing-offer"
        className={`${SITE_FREE_MODE ? 'max-w-3xl' : 'max-w-5xl'} mx-auto w-full px-4 pt-1 pb-14 sm:pb-16 scroll-mt-[7.5rem]`}
      >
        <div className="mb-6 text-center">
          <h2 className="offer-lead">
            <span className="offer-lead-line">
              {t('landing.beforeOfferLead')}
              <span className="offer-lead-accent accent-logo">{t('landing.beforeOfferAccent')}</span>,
            </span>{' '}
            <span className="offer-lead-line">{t('landing.beforeOfferRest')}</span>
          </h2>
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            {SITE_FREE_MODE ? t('landing.offersTitleFree') : t('landing.offersTitlePaid')}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {SITE_FREE_MODE
              ? t('landing.offersSubtitleFree')
              : t('landing.offersSubtitlePaid')}
          </p>
        </div>
        <div className="max-w-md mx-auto">
          {offers.map((offer) => (
            <OfferCard
              key={offer.id}
              title={offer.title}
              badge={'badge' in offer ? offer.badge : undefined}
              description={offer.description}
              points={'points' in offer ? offer.points : undefined}
              highlight={founderOfferClosed ? undefined : <FounderPrivilegeHighlight />}
              accent={offer.accent}
            />
          ))}
        </div>
        {!SITE_FREE_MODE && (
          <div className="mt-8">
            <OfferSummaryCards
              onChooseFree={() => onAuthClick?.('signup')}
            />
          </div>
        )}
      </section>

      {/* Valeurs */}
      <section className="max-w-3xl mx-auto w-full px-4 pb-14 sm:pb-16">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            {t('landing.valuesTitle')}
          </h2>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            {t('landing.valuesSubtitle')}
          </p>
        </div>
        <ul className="grid gap-8 sm:grid-cols-3 sm:gap-6">
          {values.map(({ id, title, description, Icon }) => (
            <li key={id} className="text-center sm:text-left">
              <div className="mx-auto sm:mx-0 mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-md text-aypik-raspberry">
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

      <SiteFooter />
    </div>
  );
}
