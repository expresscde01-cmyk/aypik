import { useId } from 'react';

const MATCHER_GRADIENT =
  'linear-gradient(160deg, #F9C8D0 0%, #E94375 28%, #D32F2F 50%, #1E88E5 76%, #0D47A1 100%)';

const MATCHER_RAYS = [
  { a: -8, len: 3.4 },
  { a: 32, len: 2.2 },
  { a: 78, len: 3 },
  { a: 128, len: 2.1 },
  { a: 172, len: 3.2 },
  { a: 218, len: 2.3 },
  { a: 262, len: 3.1 },
  { a: 312, len: 2.4 },
] as const;

const MATCHER_SPARKS = [
  { a: 18, r: 15.6, s: 1.15 },
  { a: 148, r: 15.2, s: 0.9 },
  { a: 268, r: 15.8, s: 1.1 },
] as const;

export default function MatcherButton({
  disabled,
  matched,
  busy,
  onClick,
  name,
  tooltip = 'right',
}: {
  disabled?: boolean;
  matched?: boolean;
  busy?: boolean;
  onClick: () => void;
  name: string;
  tooltip?: 'right' | 'top';
}) {
  const uid = useId().replace(/:/g, '');
  const gradId = `matcher-m-${uid}`;
  const cx = 20;
  const cy = 20;
  const innerR = 10.2;
  const done = Boolean(matched);
  const blocked = Boolean(disabled) && !done;
  const label = done ? 'Matché !' : 'Matcher';

  return (
    <button
      type="button"
      onClick={() => {
        if (done || blocked || busy) return;
        onClick();
      }}
      disabled={(blocked || busy) && !done}
      aria-disabled={done || blocked || busy || undefined}
      data-matched={done ? 'true' : undefined}
      aria-label={done ? `Matché avec ${name}` : `Matcher avec ${name}`}
      className={`group relative z-10 w-10 h-10 flex items-center justify-center flex-shrink-0 bg-transparent hover:z-20 cursor-default disabled:cursor-default ${
        blocked ? 'opacity-40' : done ? 'opacity-80' : ''
      }`}
    >
      <span className="matcher-m-zoom pointer-events-none relative flex items-center justify-center">
        <svg
          viewBox="0 0 40 40"
          className={`absolute inset-0 w-10 h-10 ${
            done || blocked ? 'opacity-50' : 'matcher-spark'
          }`}
          aria-hidden
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F9C8D0" />
              <stop offset="28%" stopColor="#E94375" />
              <stop offset="50%" stopColor="#D32F2F" />
              <stop offset="76%" stopColor="#1E88E5" />
              <stop offset="100%" stopColor="#0D47A1" />
            </linearGradient>
          </defs>
          {MATCHER_RAYS.map((ray) => {
            const rad = (ray.a * Math.PI) / 180;
            const x1 = cx + Math.cos(rad) * innerR;
            const y1 = cy + Math.sin(rad) * innerR;
            const x2 = cx + Math.cos(rad) * (innerR + ray.len);
            const y2 = cy + Math.sin(rad) * (innerR + ray.len);
            return (
              <line
                key={ray.a}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={`url(#${gradId})`}
                strokeWidth="0.65"
                strokeLinecap="round"
                opacity="0.7"
              />
            );
          })}
          {MATCHER_SPARKS.map((spark) => {
            const rad = (spark.a * Math.PI) / 180;
            const x = cx + Math.cos(rad) * spark.r;
            const y = cy + Math.sin(rad) * spark.r;
            const s = spark.s;
            return (
              <path
                key={spark.a}
                d={`M ${x} ${y - s} L ${x + s * 0.28} ${y - s * 0.28} L ${x + s} ${y} L ${x + s * 0.28} ${y + s * 0.28} L ${x} ${y + s} L ${x - s * 0.28} ${y + s * 0.28} L ${x - s} ${y} L ${x - s * 0.28} ${y - s * 0.28} Z`}
                fill={`url(#${gradId})`}
                opacity="0.9"
              />
            );
          })}
          <path
            d="M26.2 8.4 24.1 12.6h2.1L24.4 17"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="0.85"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.8"
          />
          <path
            d="M13.4 27.2 15.4 23.2h-2L15.6 19"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.65"
          />
        </svg>
        <span
          className="relative z-[1] text-[1.15rem] font-semibold leading-none tracking-tight matcher-m-glyph"
          style={{ backgroundImage: MATCHER_GRADIENT }}
          aria-hidden
        >
          M
        </span>
      </span>
      <span
        className={`pointer-events-none absolute whitespace-nowrap rounded-full border bg-white/95 px-2 py-0.5 text-[11px] font-medium tracking-wide shadow-sm opacity-0 transition-all duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 ${
          done
            ? 'border-emerald-100 text-emerald-700'
            : 'border-rose-100 text-rose-600'
        } ${
          tooltip === 'top'
            ? 'bottom-full left-1/2 mb-1.5 -translate-x-1/2 translate-y-1 group-hover:translate-y-0 group-focus-visible:translate-y-0'
            : 'left-full ml-1.5 top-1/2 -translate-y-1/2 -translate-x-1 group-hover:translate-x-0 group-focus-visible:translate-x-0'
        }`}
      >
        {label}
      </span>
    </button>
  );
}
