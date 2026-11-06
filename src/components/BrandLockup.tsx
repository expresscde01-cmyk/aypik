import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { BRAND_LOCKUP_NO_COPY_CLASS } from '@/lib/brandCopyGuard';

type BrandLockupProps = {
  variant?: 'nav' | 'hero' | 'inline';
  className?: string;
  /** Overrides the sm breakpoint: stacked short tagline vs inline long phrase. */
  compact?: boolean;
  /**
   * Masque entièrement le slogan court mobile (au lieu de le tronquer)
   * quand il n'y a plus la place de l'afficher en entier — voir
   * useMobileTaglineFits. Sans effet sur le slogan long PC (`hidden sm:inline`).
   */
  hideTagline?: boolean;
};

const BRAND = 'Aypik';
const BASELINE = 'Le site de rencontre destiné aux personnes sans enfants';
const BRAND_SHORT_TAGLINE = 'Communauté sans enfants';

/** Dégradé du logo (cœur verni). */
export const BRAND_GRADIENT_CSS =
  'linear-gradient(90deg,#B8125F 0%,#CE0E5E 35%,#DE063C 60%,#EC3C0E 85%,#F26A0A 100%)';

const BRAND_GRADIENT_STOPS = [
  { offset: '0%', color: '#B8125F' },
  { offset: '35%', color: '#CE0E5E' },
  { offset: '60%', color: '#DE063C' },
  { offset: '85%', color: '#EC3C0E' },
  { offset: '100%', color: '#F26A0A' },
] as const;

/**
 * Tracé Lucide Heart (viewBox 0 0 24 24) — ne pas modifier.
 */
export const BRAND_HEART_PATH =
  'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z';

/**
 * Étincelle 4 branches fines (R=1), côtés concaves.
 * M0,-R C(R*0.167),-(R*0.202) (R*0.202),-(R*0.167) R,0 … (+ symétriques).
 */
const BRAND_SPARKLE_PATH =
  'M0,-1 C0.167,-0.202 0.202,-0.167 1,0 C0.202,0.167 0.167,0.202 0,1 C-0.167,0.202 -0.202,0.167 -1,0 C-0.202,-0.167 -0.167,-0.202 0,-1 Z';

/** 12.5 % de H≈18 → étoile = 25 % de la hauteur du cœur. */
const BRAND_SPARKLE_R = 2.25;

/** Lobe droit ; pointe basse pile au creux (~y=7) ; pas de rotation. */
const SPARKLE_TRANSFORM = `translate(15.5 ${7 - BRAND_SPARKLE_R}) scale(${BRAND_SPARKLE_R})`;

type BrandHeartProps = {
  className?: string;
};

/** Heart filled with the brand gradient + clipped white sparkle. */
export function BrandHeart({ className = 'w-6 h-6' }: BrandHeartProps) {
  const rawId = useId();
  const uid = rawId.replace(/:/g, '');
  const gradId = `aypik-heart-${uid}`;
  const clipId = `aypik-heart-clip-${uid}`;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          {BRAND_GRADIENT_STOPS.map((stop) => (
            <stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={stop.color}
            />
          ))}
        </linearGradient>
        <clipPath id={clipId}>
          <path d={BRAND_HEART_PATH} />
        </clipPath>
      </defs>
      <path
        d={BRAND_HEART_PATH}
        fill={`url(#${gradId})`}
        stroke={`url(#${gradId})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g clipPath={`url(#${clipId})`}>
        <g transform={SPARKLE_TRANSFORM}>
          <path d={BRAND_SPARKLE_PATH} fill="#FFFFFF" />
        </g>
      </g>
    </svg>
  );
}

type BrandMarkProps = {
  size?: 'nav' | 'sm' | 'md' | 'lg';
  className?: string;
  src?: string;
};

const MARK_BOX = {
  nav: 'w-[24px] sm:w-[26px]',
  sm: 'w-12',
  md: 'w-[75px] md:w-[6.5rem]',
  lg: 'w-[72px]',
} as const;

/** Cœur verni 192×169 (2× d’un affichage ~96 px). */
const BRAND_MARK_PNG = `${import.meta.env.BASE_URL}aypik-coeur-mark.png?v=1`;
const BRAND_MARK_WEBP = `${import.meta.env.BASE_URL}aypik-coeur-mark.webp?v=1`;
const BRAND_MARK_SRC = BRAND_MARK_PNG;
/** Même cœur sur connexion, mot de passe, contact. Le hero utilise aypik-coeur-hero.webp. */
export const BRAND_MARK_AUTH_SRC = BRAND_MARK_PNG;
const BRAND_NAME_SRC = '/aypik-nom.svg?v=1';

/** Nom AYPIK en logo. La hauteur vient de className (16/20 px en en-tête, 28/34 px sous le cœur). */
export function BrandNameImg({ className }: { className: string }) {
  return (
    <img
      src={BRAND_NAME_SRC}
      alt="Aypik"
      width={3464}
      height={722}
      draggable={false}
      className={`w-auto shrink-0 select-none ${BRAND_LOCKUP_NO_COPY_CLASS} ${className}`}
    />
  );
}

/**
 * Logo cœur détouré (PNG alpha) — header et landing.
 * Favicon onglet : pipeline SVG (build-favicons). PWA / apple-touch :
 * `public/app-icon-source.png` via scripts/build-app-icons.cjs.
 * Ne pas confondre avec le cœur d’en-tête (24/26 px)
 * ni avec le grand cœur du hero.
 */
export function BrandMark({
  size = 'md',
  className = '',
  src = BRAND_MARK_SRC,
}: BrandMarkProps) {
  return (
    <picture className={`relative inline-flex shrink-0 ${MARK_BOX[size]} ${className}`}>
      <source srcSet={BRAND_MARK_WEBP} type="image/webp" />
      <img
        src={src}
        alt=""
        width={192}
        height={169}
        decoding="async"
        className="h-auto w-full select-none object-contain"
        aria-hidden
        draggable={false}
      />
    </picture>
  );
}

const HEADER_HEART_PNG = '/aypik-coeur-header.png?v=1';
const HEADER_HEART_WEBP = '/aypik-coeur-header.webp?v=1';

/** Cœur verni de l’en-tête : 24 px mobile, 26 px ordinateur. */
function HeaderHeart() {
  return (
    <picture className="inline-flex shrink-0">
      <source srcSet={HEADER_HEART_WEBP} type="image/webp" />
      <img
        src={HEADER_HEART_PNG}
        alt=""
        width={96}
        height={84}
        decoding="async"
        draggable={false}
        aria-hidden
        className="h-auto w-[24px] select-none object-contain sm:w-[26px]"
      />
    </picture>
  );
}

/** Wrapper header : centrage vertical avec le lockup AYPIK + sous-titre. */
export function BrandMarkNav({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center leading-none ${className}`}
    >
      <HeaderHeart />
    </span>
  );
}

type BrandHeaderBrandProps = {
  compact?: boolean;
  hideTagline?: boolean;
  className?: string;
};

/**
 * Cluster header : cœur + « AYPIK » toujours côte à côte (nowrap).
 * Le sous-titre passe sous AYPIK (indenté), hors de la rangée du cœur —
 * pour que le centrage vertical du cœur ne se fasse que sur la ligne AYPIK.
 */
export function BrandHeaderBrand({
  compact,
  hideTagline = false,
  className = '',
}: BrandHeaderBrandProps) {
  const { t } = useTranslation();
  const baseline = t('common.brandBaseline');
  const shortTag = t('common.brandShortTagline');
  const stacked =
    compact === true ? true : compact === false ? false : null;

  const shortTagClass = `min-w-0 text-[10.5px] font-light text-gray-400 tracking-normal leading-none whitespace-nowrap overflow-hidden text-ellipsis ${BRAND_LOCKUP_NO_COPY_CLASS}`;
  const longTagClass = `min-w-0 whitespace-nowrap text-xs font-light text-gray-400 tracking-wide leading-none overflow-hidden text-ellipsis ${BRAND_LOCKUP_NO_COPY_CLASS}`;
  /** Décalage = largeur du cœur (24 / sm:26) + gap-2 (0.5rem). */
  const tagIndent = 'pl-[calc(24px+0.5rem)] sm:pl-[calc(26px+0.5rem)]';

  if (stacked === false) {
    return (
      <span
        className={`inline-flex flex-nowrap items-center gap-2 min-w-0 max-w-full ${className}`}
      >
        <BrandMarkNav />
        <span className="inline-flex flex-nowrap items-center gap-1 min-w-0 overflow-hidden">
          <BrandNameImg className="h-[16px] sm:h-[20px]" />
          <span className={longTagClass}>{baseline}</span>
        </span>
      </span>
    );
  }

  const showShortTag =
    stacked === true || (!hideTagline && stacked === null);

  /** Sous-titre masqué : une seule ligne, pour le centrer dans le header. */
  if (!showShortTag) {
    return (
      <span
        className={`inline-flex flex-nowrap items-center gap-2 min-w-0 max-w-full ${className}`}
      >
        <BrandMarkNav />
        <span className="inline-flex flex-nowrap items-center gap-1 min-w-0 overflow-hidden">
          <BrandNameImg className="h-[16px] sm:h-[20px]" />
          {stacked === null && (
            <span className={`hidden sm:inline ${longTagClass}`}>{baseline}</span>
          )}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex flex-col items-stretch gap-0.5 min-w-0 max-w-full ${className}`}
    >
      <span className="inline-flex flex-nowrap items-center gap-2 min-w-0">
        <BrandMarkNav />
        <span className="inline-flex flex-nowrap items-center gap-1 min-w-0 overflow-hidden">
          <BrandNameImg className="h-[16px] sm:h-[20px]" />
          {stacked === null && (
            <span className={`hidden sm:inline ${longTagClass}`}>{baseline}</span>
          )}
        </span>
      </span>
      {stacked === true ? (
        <span className={`${tagIndent} ${shortTagClass}`}>{shortTag}</span>
      ) : (
        <span className={`sm:hidden ${tagIndent} ${shortTagClass}`}>
          {shortTag}
        </span>
      )}
    </span>
  );
}

export function BrandLockup({
  variant = 'nav',
  className = '',
  compact,
  hideTagline = false,
}: BrandLockupProps) {
  const { t } = useTranslation();
  const baseline = t('common.brandBaseline');
  const shortTag = t('common.brandShortTagline');
  if (variant === 'hero') {
    return (
      <div className={`text-center ${className}`}>
        <BrandNameImg className="mx-auto h-7 sm:h-[34px]" />
        <p className="mt-3 text-xs font-light text-gray-400 tracking-wide">
          <span className="mr-1.5 text-gray-300" aria-hidden>
            —
          </span>
          {baseline}
        </p>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`}>
        <BrandNameImg className="h-4" />
        <span className="text-xs font-light tracking-wide text-gray-600">
          <span className="mr-1" aria-hidden>
            —
          </span>
          {baseline}
        </span>
      </span>
    );
  }

  const stacked =
    compact === true
      ? true
      : compact === false
        ? false
        : null;

  return (
    <div
      className={`min-w-0 overflow-hidden flex ${
        stacked === true
          ? 'flex-col gap-0.5'
          : stacked === false
            ? 'flex-row items-baseline gap-1'
            : 'flex-col gap-0.5 sm:min-w-max sm:flex-row sm:items-baseline sm:gap-1'
      } ${className}`}
    >
      <BrandNameImg className="h-5 shrink-0 self-center sm:h-6" />
      {stacked === true ? (
        <span
          className={`text-[10.5px] font-light text-gray-400 tracking-normal leading-none whitespace-nowrap overflow-hidden text-ellipsis ${BRAND_LOCKUP_NO_COPY_CLASS}`}
        >
          {shortTag}
        </span>
      ) : stacked === false ? (
        <span
          className={`whitespace-nowrap text-xs font-light text-gray-400 tracking-wide leading-none overflow-hidden text-ellipsis ${BRAND_LOCKUP_NO_COPY_CLASS}`}
        >
          {baseline}
        </span>
      ) : (
        <>
          {!hideTagline && (
            <span
              className={`sm:hidden text-[10.5px] font-light text-gray-400 tracking-normal leading-none whitespace-nowrap overflow-hidden text-ellipsis ${BRAND_LOCKUP_NO_COPY_CLASS}`}
            >
              {shortTag}
            </span>
          )}
          <span
            className={`hidden sm:inline whitespace-nowrap text-xs font-light text-gray-400 tracking-wide leading-none overflow-hidden text-ellipsis ${BRAND_LOCKUP_NO_COPY_CLASS}`}
          >
            {baseline}
          </span>
        </>
      )}
    </div>
  );
}

export const BRAND_NAME = BRAND;
export const BRAND_BASELINE = BASELINE;
export const BRAND_SHORT_TAGLINE_TEXT = BRAND_SHORT_TAGLINE;
export const BRAND_FULL = `${BRAND} — ${BASELINE}`;
