import { useId } from 'react';
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

/** Same stops as AYPIK wordmark — rose vif → ambre */
export const BRAND_GRADIENT_CSS =
  'linear-gradient(90deg,#f43f5e 0%,#f43f5e 35%,#fb7185 50%,#fbbf24 100%)';

const BRAND_GRADIENT_STOPS = [
  { offset: '0%', color: '#f43f5e' },
  { offset: '35%', color: '#f43f5e' },
  { offset: '50%', color: '#fb7185' },
  { offset: '100%', color: '#fbbf24' },
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
};

const MARK_BOX = {
  /**
   * Header uniquement — px figés (pas d’em) :
   * AYPIK = text-base 16px → cœur 18px (+12,5 %) ;
   * sm+ = text-lg 18px → cœur 20px (+11 %).
   */
  nav: 'w-[18px] h-[18px] sm:w-[20px] sm:h-[20px]',
  sm: 'w-11 h-11',
  /**
   * Hero landing uniquement.
   * Mobile (&lt;640px) : 4.25rem (−~23 % vs 5.5rem) ; sm+ inchangé 6.5rem.
   */
  md: 'w-[4.25rem] h-[4.25rem] sm:w-[6.5rem] sm:h-[6.5rem]',
  lg: 'w-32 h-32 sm:w-36 sm:h-36',
} as const;

const MARK_INTRINSIC: Record<keyof typeof MARK_BOX, number> = {
  nav: 20,
  sm: 44,
  md: 104,
  lg: 144,
};

/** Asset UI (header, landing, auth) — indépendant du favicon SVG/ICO. */
const BRAND_MARK_SRC = `${import.meta.env.BASE_URL}brand-mark-transparent.png`;

/**
 * Logo cœur détouré (PNG alpha) — header, landing, auth.
 * Favicon onglet : pipeline SVG (build-favicons). PWA / apple-touch :
 * `public/app-icon-source.png` via scripts/build-app-icons.cjs.
 * Ne pas confondre avec ce PNG transparent (header / hero / auth)
 * ni avec brand-mark.png (tuile carte).
 */
export function BrandMark({ size = 'md', className = '' }: BrandMarkProps) {
  const px = MARK_INTRINSIC[size];
  return (
    <img
      src={BRAND_MARK_SRC}
      alt=""
      width={px}
      height={px}
      decoding="async"
      className={`relative shrink-0 object-contain select-none ${MARK_BOX[size]} ${className}`}
      aria-hidden
      draggable={false}
    />
  );
}

/** Wrapper header : centrage vertical avec le lockup AYPIK + sous-titre. */
export function BrandMarkNav({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center leading-none ${className}`}
    >
      <BrandMark size="nav" />
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
  const stacked =
    compact === true ? true : compact === false ? false : null;

  const brandClass = `shrink-0 text-base sm:text-lg font-extrabold text-gray-900 uppercase tracking-[0.28em] leading-none ${BRAND_LOCKUP_NO_COPY_CLASS}`;
  const shortTagClass = `min-w-0 text-[10.5px] font-light text-gray-400 tracking-normal leading-none whitespace-nowrap overflow-hidden text-ellipsis ${BRAND_LOCKUP_NO_COPY_CLASS}`;
  const longTagClass = `min-w-0 whitespace-nowrap text-xs font-light text-gray-400 tracking-wide leading-none overflow-hidden text-ellipsis ${BRAND_LOCKUP_NO_COPY_CLASS}`;
  /** Décalage = largeur cœur nav (18 / sm:20) + gap-2 (0.5rem). */
  const tagIndent = 'pl-[calc(18px+0.5rem)] sm:pl-[calc(20px+0.5rem)]';

  if (stacked === false) {
    return (
      <span
        className={`inline-flex flex-nowrap items-center gap-2 min-w-0 max-w-full ${className}`}
      >
        <BrandMarkNav />
        <span className="inline-flex flex-nowrap items-baseline gap-1 min-w-0 overflow-hidden">
          <span className={brandClass}>{BRAND}</span>
          <span className={longTagClass}>{BASELINE}</span>
        </span>
      </span>
    );
  }

  const showShortTag =
    stacked === true || (!hideTagline && stacked === null);

  return (
    <span
      className={`inline-flex flex-col items-stretch gap-0.5 min-w-0 max-w-full ${className}`}
    >
      <span className="inline-flex flex-nowrap items-center gap-2 min-w-0">
        <BrandMark size="nav" />
        <span className="inline-flex flex-nowrap items-baseline gap-1 min-w-0 overflow-hidden">
          <span className={brandClass}>{BRAND}</span>
          {stacked === null && (
            <span className={`hidden sm:inline ${longTagClass}`}>{BASELINE}</span>
          )}
        </span>
      </span>
      {stacked === true ? (
        <span className={`${tagIndent} ${shortTagClass}`}>{BRAND_SHORT_TAGLINE}</span>
      ) : (
        showShortTag && (
          <span className={`sm:hidden ${tagIndent} ${shortTagClass}`}>
            {BRAND_SHORT_TAGLINE}
          </span>
        )
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
  if (variant === 'hero') {
    return (
      <div className={`text-center ${className}`}>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 uppercase tracking-[0.28em]">
          {BRAND}
        </h1>
        <p className="mt-3 text-xs font-light text-gray-400 tracking-wide">
          <span className="mr-1.5 text-gray-300" aria-hidden>
            —
          </span>
          {BASELINE}
        </p>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
        <span
          className="font-extrabold uppercase tracking-[0.22em]"
          style={{ color: '#FF4500' }}
        >
          {BRAND}
        </span>
        <span className="text-xs font-light tracking-wide text-gray-600">
          <span className="mr-1" aria-hidden>
            —
          </span>
          {BASELINE}
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
      <span
        className={`shrink-0 text-base sm:text-lg font-extrabold text-gray-900 uppercase tracking-[0.28em] leading-none ${BRAND_LOCKUP_NO_COPY_CLASS}`}
      >
        {BRAND}
      </span>
      {stacked === true ? (
        <span
          className={`text-[10.5px] font-light text-gray-400 tracking-normal leading-none whitespace-nowrap overflow-hidden text-ellipsis ${BRAND_LOCKUP_NO_COPY_CLASS}`}
        >
          {BRAND_SHORT_TAGLINE}
        </span>
      ) : stacked === false ? (
        <span
          className={`whitespace-nowrap text-xs font-light text-gray-400 tracking-wide leading-none overflow-hidden text-ellipsis ${BRAND_LOCKUP_NO_COPY_CLASS}`}
        >
          {BASELINE}
        </span>
      ) : (
        <>
          {!hideTagline && (
            <span
              className={`sm:hidden text-[10.5px] font-light text-gray-400 tracking-normal leading-none whitespace-nowrap overflow-hidden text-ellipsis ${BRAND_LOCKUP_NO_COPY_CLASS}`}
            >
              {BRAND_SHORT_TAGLINE}
            </span>
          )}
          <span
            className={`hidden sm:inline whitespace-nowrap text-xs font-light text-gray-400 tracking-wide leading-none overflow-hidden text-ellipsis ${BRAND_LOCKUP_NO_COPY_CLASS}`}
          >
            {BASELINE}
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
