import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Gift, Heart, HeartHandshake, LogOut, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { BrandHeaderBrand, BRAND_GRADIENT_CSS, BRAND_MARK_AUTH_SRC } from '@/components/BrandLockup';
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
  founderBenefitLifetimeDiscount,
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

const VALUE_ICONS = {
  confiance: ShieldCheck,
  bienveillance: HeartHandshake,
  'vecu-commun': Sparkles,
} as const;

/** Test visuel du sillage sur le titre FR. Passer à false pour le retirer. */
const SHOW_TITLE_TRAIL = true;

const TITLE_TRAIL_PATH =
  'M -30 86 L -24 86 L -19 85 L -13 85 L -8 84 L -2 84 L 3 83 L 9 82 L 14 81 L 19 80 L 25 80 L 30 79 L 35 78 L 40 77 L 45 76 L 50 75 L 55 74 L 59 73 L 64 72 L 69 71 L 73 70 L 78 68 L 82 67 L 86 66 L 91 65 L 95 64 L 99 62 L 103 61 L 107 60 L 110 58 L 114 57 L 118 56 L 121 54 L 125 53 L 128 52 L 131 50 L 134 49 L 137 47 L 140 46 L 143 44 L 146 43 L 148 41 L 151 40 L 153 38 L 156 37 L 158 35 L 160 34 L 162 32 L 164 31 L 166 29 L 167 28 L 169 26 L 170 25 L 172 24 L 173 22 L 174 20 L 175 19 L 176 18 L 177 16 L 178 15 L 178 13 L 179 12 L 180 10 L 180 9 L 180 8 L 180 6 L 180 5 L 180 4 L 180 2 L 180 1 L 180 0 L 180 -1 L 179 -2 L 179 -4 L 178 -5 L 177 -6 L 176 -7 L 176 -8 L 175 -9 L 174 -10 L 173 -11 L 172 -12 L 170 -13 L 169 -14 L 168 -15 L 166 -16 L 165 -17 L 164 -18 L 162 -18 L 160 -19 L 159 -20 L 157 -20 L 155 -21 L 154 -22 L 152 -22 L 150 -23 L 148 -23 L 146 -24 L 144 -24 L 142 -24 L 140 -25 L 138 -25 L 136 -25 L 134 -26 L 132 -26 L 130 -26 L 128 -26 L 126 -26 L 124 -26 L 122 -26 L 119 -26 L 117 -26 L 115 -26 L 113 -26 L 111 -25 L 109 -25 L 107 -25 L 105 -24 L 103 -24 L 101 -24 L 99 -23 L 97 -23 L 95 -22 L 94 -22 L 92 -21 L 90 -21 L 88 -20 L 87 -19 L 85 -19 L 84 -18 L 82 -17 L 80 -16 L 79 -15 L 78 -14 L 76 -14 L 75 -13 L 74 -12 L 73 -11 L 72 -10 L 71 -9 L 70 -8 L 70 -6 L 69 -5 L 68 -4 L 68 -3 L 67 -2 L 67 0 L 66 1 L 66 2 L 66 3 L 66 5 L 66 6 L 66 7 L 67 9 L 67 10 L 67 12 L 68 13 L 69 14 L 69 16 L 70 17 L 71 19 L 72 20 L 73 22 L 74 23 L 76 24 L 77 26 L 79 28 L 80 29 L 82 30 L 84 32 L 86 34 L 88 35 L 90 36 L 93 38 L 95 40 L 97 41 L 100 42 L 103 44 L 106 45 L 108 47 L 111 48 L 114 50 L 118 51 L 121 52 L 124 54 L 128 55 L 131 57 L 135 58 L 139 59 L 143 61 L 146 62 L 150 63 L 155 64 L 159 66 L 163 67 L 168 68 L 172 69 L 176 70 L 181 72 L 186 72 L 190 74 L 195 75 L 200 76 L 205 77 L 210 78 L 215 78 L 220 79 L 226 80 L 231 81 L 236 82 L 242 82 L 247 83 L 252 84 L 258 85 L 264 85 L 269 86 L 275 86 L 281 87 L 286 87 L 292 88 L 298 88 L 304 88 L 309 89 L 315 89 L 321 89 L 327 90 L 333 90 L 339 90 L 345 90 L 351 90 L 357 90 L 362 90 L 368 90 L 374 90 L 380 90 L 386 90 L 392 89 L 398 89 L 404 89 L 410 88 L 415 88 L 421 88 L 427 87 L 433 87 L 438 86 L 444 86 L 450 85 L 455 84 L 460 84 L 466 83 L 471 82 L 477 82 L 482 81 L 487 80 L 493 79 L 498 78 L 503 77 L 508 76 L 513 75 L 518 74 L 522 73 L 527 72 L 532 71 L 536 70 L 541 69 L 545 68 L 550 66 L 554 65 L 558 64 L 562 63 L 566 62 L 570 60 L 574 59 L 578 58 L 581 56 L 585 55 L 588 54 L 592 52 L 595 51 L 598 49 L 601 48 L 604 46 L 607 45 L 610 44 L 612 42 L 615 40 L 617 39 L 620 38 L 622 36 L 624 35 L 626 33 L 628 32 L 630 30 L 632 29 L 633 27 L 635 26 L 636 24 L 637 23 L 639 21 L 640 20 L 641 18 L 642 17 L 642 15 L 643 14 L 644 12 L 644 11 L 645 10 L 645 8 L 645 7 L 645 6 L 645 4 L 645 3 L 645 2 L 645 0 L 645 -1 L 644 -2 L 644 -3 L 643 -4 L 643 -6 L 642 -7 L 641 -8 L 640 -9 L 639 -10 L 638 -11 L 637 -12 L 636 -13 L 635 -14 L 633 -15 L 632 -16 L 631 -16 L 629 -17 L 628 -18 L 626 -19 L 624 -20 L 623 -20 L 621 -21 L 619 -21 L 618 -22 L 616 -22 L 614 -23 L 612 -23 L 610 -24 L 608 -24 L 606 -25 L 604 -25 L 602 -25 L 600 -25 L 598 -26 L 596 -26 L 594 -26 L 592 -26 L 590 -26 L 587 -26 L 585 -26 L 583 -26 L 581 -26 L 579 -26 L 577 -25 L 575 -25 L 573 -25 L 571 -25 L 569 -24 L 567 -24 L 565 -24 L 563 -23 L 561 -23 L 559 -22 L 558 -22 L 556 -21 L 554 -20 L 552 -20 L 551 -19 L 549 -18 L 548 -17 L 546 -17 L 545 -16 L 543 -15 L 542 -14 L 541 -13 L 540 -12 L 538 -11 L 537 -10 L 536 -9 L 536 -8 L 535 -7 L 534 -6 L 533 -5 L 533 -3 L 532 -2 L 532 -1 L 532 0 L 531 2 L 531 3 L 531 4 L 531 5 L 531 7 L 532 8 L 532 10 L 532 11 L 533 12 L 533 14 C 551 28, 616 46, 640 78 C 660 104, 720 112, 780 102 C 816 94, 856 104, 852 130 C 848 154, 796 146, 810 114 C 826 88, 866 66, 882 40 C 890 26, 893 10, 902 -6';

function HeroTitleTrail() {
  return (
    <svg
      className="title-trail"
      viewBox="-40 -60 960 220"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path
        d={TITLE_TRAIL_PATH}
        fill="none"
        stroke="#1B1F3B"
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeDasharray="5 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g transform="translate(902 -6) rotate(-60.6)">
        <path d="M0 -10 L30 0 L2 9 L7 1 Z" fill="#1B1F3B" />
        <path d="M7 1 L30 0 L2 9 Z" fill="#4A4F72" />
      </g>
    </svg>
  );
}

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

/** Cœur du hero : le logo déjà affiché s’ouvre et laisse sortir la phrase. */
function HeroHeart() {
  const { t } = useTranslation();
  const line1 = t('landing.heroChildFreeLine1');
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
          <p className="hero-heart-line1">{line1}</p>
          <span className="hero-heart-visual">
            <span className="hero-heart-line2">{line2}</span>
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
            <img
              src={BRAND_MARK_AUTH_SRC}
              alt=""
              draggable={false}
              className="hero-heart-half hero-heart-half--left"
            />
            <img
              src={BRAND_MARK_AUTH_SRC}
              alt=""
              draggable={false}
              className="hero-heart-half hero-heart-half--right"
            />
            <img
              src={BRAND_MARK_AUTH_SRC}
              alt=""
              draggable={false}
              className="hero-heart-whole"
            />
          </span>
        </button>
      </div>
      <p
        className="w-fit mx-auto text-xl sm:text-2xl font-extrabold uppercase tracking-[0.32em] bg-clip-text text-transparent"
        style={{ backgroundImage: BRAND_GRADIENT_CSS }}
        aria-label="Aypik"
      >
        Aypik
      </p>
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
    <header className="bg-white/85 backdrop-blur-md border-b border-rose-100/80">
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
            className="inline-flex flex-nowrap items-center min-w-0 max-w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2"
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
                      {t('common.signOutShort')}
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
                {t('landing.headerAuth')}
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
  highlight?: string;
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
        {highlight ? (
          <p className="rounded-xl bg-white/75 border border-white/90 px-3 py-2.5 text-sm sm:text-base font-bold text-amber-950 leading-snug shadow-sm">
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
  const { t } = useTranslation();
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
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-3 sm:pt-10 sm:pb-4 text-center">
          <div className="hero-headline-stack">
            <h1
              className="hero-headline text-4xl sm:text-5xl md:text-[3.25rem] font-extrabold tracking-tight leading-[1.25] pb-1 animate-pop"
            >
              {SHOW_TITLE_TRAIL && currentLocale() === 'fr' ? (
                <span className="title-trail-anchor">
                  <span className="title-trail-text">{t('landing.heroTitleLine1')}</span>
                  <HeroTitleTrail />
                </span>
              ) : (
                t('landing.heroTitleLine1')
              )}
              <br />
              <span className="hero-headline-accent">{t('landing.heroTitleLine2')}</span>
            </h1>
          </div>

          <HeroHeart />

          <p className="hero-meet">{t('landing.heroMeet')}</p>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 animate-fadeIn">
            <button
              type="button"
              onClick={connected ? onPrimaryCta : () => onAuthClick?.('signup')}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200/70 hover:opacity-95 transition-opacity"
            >
              {connected ? t('landing.ctaMatches') : t('landing.ctaJoin')}
            </button>
            {!connected && (
              <button
                type="button"
                onClick={() => onAuthClick?.('signin')}
                className="w-full sm:w-auto px-7 py-3.5 rounded-2xl border border-rose-200 bg-white/70 text-gray-800 font-semibold hover:bg-white transition-colors"
              >
                {t('landing.ctaSignIn')}
              </button>
            )}
          </div>

          <button
            type="button"
            className="hero-scroll-hint"
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
              highlight={
                founderOfferClosed
                  ? undefined
                  : founderBenefitLifetimeDiscount()
              }
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

      <SiteFooter />
    </div>
  );
}
