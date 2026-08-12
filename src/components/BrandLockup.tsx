type BrandLockupProps = {
  variant?: 'nav' | 'hero' | 'inline';
  className?: string;
};

const BRAND = 'Aypik';
const BASELINE = 'Le site de rencontre destiné aux personnes sans enfants';

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
        <span className="font-extrabold uppercase tracking-[0.22em]">{BRAND}</span>
        <span className="text-xs font-light tracking-wide text-current/45">
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
