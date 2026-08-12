import { useId } from 'react';
import { Heart } from 'lucide-react';

type BrandLockupProps = {
  variant?: 'nav' | 'hero' | 'inline';
  className?: string;
};

const BRAND = 'Aypik';
const BASELINE = 'Le site de rencontre destiné aux personnes sans enfants';

/** Same stops as AYPIK wordmark — rose vif → ambre */
export const BRAND_GRADIENT_CSS =
  'linear-gradient(90deg,#f43f5e 0%,#f43f5e 35%,#fb7185 50%,#fbbf24 100%)';

const BRAND_GRADIENT_STOPS = [
  { offset: '0%', color: '#f43f5e' },
  { offset: '35%', color: '#f43f5e' },
  { offset: '50%', color: '#fb7185' },
  { offset: '100%', color: '#fbbf24' },
] as const;

type BrandHeartProps = {
  className?: string;
};

/** Heart filled with the brand gradient (top rose → bottom amber). */
export function BrandHeart({ className = 'w-6 h-6' }: BrandHeartProps) {
  const rawId = useId();
  const gradId = `aypik-heart-${rawId.replace(/:/g, '')}`;

  return (
    <>
      <svg width={0} height={0} className="absolute" aria-hidden>
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
        </defs>
      </svg>
      <Heart
        className={className}
        fill={`url(#${gradId})`}
        stroke={`url(#${gradId})`}
        aria-hidden
      />
    </>
  );
}

type BrandMarkProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const MARK_BOX = {
  sm: 'w-8 h-8 rounded-lg shadow-sm',
  md: 'w-12 h-12 sm:w-14 sm:h-14 rounded-2xl shadow-lg shadow-rose-200/70',
  lg: 'w-16 h-16 rounded-2xl shadow-lg shadow-rose-200',
} as const;

const MARK_HEART = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6 sm:w-7 sm:h-7',
  lg: 'w-8 h-8',
} as const;

/** Logo tile: light plate + gradient heart aligned with AYPIK text. */
export function BrandMark({ size = 'md', className = '' }: BrandMarkProps) {
  return (
    <div
      className={`relative shrink-0 bg-white border border-rose-100 flex items-center justify-center ${MARK_BOX[size]} ${className}`}
    >
      <BrandHeart className={MARK_HEART[size]} />
    </div>
  );
}

export function BrandLockup({ variant = 'nav', className = '' }: BrandLockupProps) {
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

  return (
    <div className={`min-w-0 flex items-baseline gap-2 ${className}`}>
      <span className="shrink-0 text-base sm:text-lg font-extrabold text-gray-900 uppercase tracking-[0.28em] leading-none">
        {BRAND}
      </span>
      <span className="min-w-0 truncate text-xs font-light text-gray-400 tracking-wide leading-none">
        <span className="mr-1.5 text-gray-300" aria-hidden>
          —
        </span>
        {BASELINE}
      </span>
    </div>
  );
}

export const BRAND_NAME = BRAND;
export const BRAND_BASELINE = BASELINE;
export const BRAND_FULL = `${BRAND} — ${BASELINE}`;
