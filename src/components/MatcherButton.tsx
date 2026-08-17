import MatcherWord, { CrownIcon } from '@/components/MatcherWord';

const MATCHER_SPARKLES = [
  { a: -22, r: 22, s: 7, tone: 'pink' },
  { a: 3, r: 20, s: 4, tone: 'white' },
  { a: 28, r: 21, s: 5, tone: 'gold' },
  { a: 78, r: 22.5, s: 6.5, tone: 'pink' },
  { a: 105, r: 20.5, s: 4.5, tone: 'white' },
  { a: 132, r: 21.5, s: 4.5, tone: 'gold' },
  { a: 178, r: 22, s: 6, tone: 'pink' },
  { a: 203, r: 20, s: 4, tone: 'white' },
  { a: 228, r: 21, s: 5, tone: 'gold' },
  { a: 278, r: 22.5, s: 6.5, tone: 'pink' },
  { a: 303, r: 20.5, s: 4.5, tone: 'white' },
  { a: 328, r: 21.5, s: 4.5, tone: 'gold' },
] as const;

export default function MatcherButton({
  disabled,
  matched,
  busy,
  onClick,
  name,
  tooltip = 'logo-tr',
}: {
  disabled?: boolean;
  matched?: boolean;
  busy?: boolean;
  onClick: () => void;
  name: string;
  tooltip?: 'right' | 'top' | 'left' | 'logo' | 'logo-tr';
}) {
  const done = Boolean(matched);
  const blocked = Boolean(disabled) && !done;

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
      className={`matcher-btn group relative z-10 w-9 h-9 flex items-center justify-center flex-shrink-0 overflow-visible bg-transparent hover:z-20 cursor-pointer disabled:cursor-default ${
        blocked ? 'opacity-40' : done ? 'opacity-80' : ''
      }`}
    >
      <span className="matcher-crown-wrap pointer-events-none relative flex h-8 w-8 items-center justify-center">
        <span className="matcher-sparks" aria-hidden>
          {MATCHER_SPARKLES.map((spark, i) => {
            const rad = (spark.a * Math.PI) / 180;
            return (
              <span
                key={spark.a}
                className={`matcher-sparkle matcher-sparkle--${spark.tone}`}
                style={{
                  width: spark.s,
                  height: spark.s,
                  left: `calc(50% + ${Math.cos(rad) * spark.r}px)`,
                  top: `calc(50% + ${Math.sin(rad) * spark.r}px)`,
                  animationDelay: `${i * 0.08}s`,
                }}
              />
            );
          })}
        </span>
        <span className="relative z-[1] flex h-8 w-8 items-center justify-center rounded-full bg-[#FCE4EC] text-[#E91E63]">
          <CrownIcon size="1.15rem" />
        </span>
      </span>
      <span
        className={`pointer-events-none absolute z-30 whitespace-nowrap rounded-full border bg-white/95 px-2 py-0.5 text-[11px] font-medium tracking-wide shadow-sm opacity-0 transition-all duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 ${
          done
            ? 'border-emerald-100 text-emerald-700'
            : 'border-rose-100 text-rose-600'
        } ${
          tooltip === 'top'
            ? 'bottom-full left-1/2 mb-1.5 -translate-x-1/2 translate-y-1 group-hover:translate-y-0 group-focus-visible:translate-y-0'
            : tooltip === 'left'
              ? 'right-full mr-1.5 top-1/2 -translate-y-1/2 translate-x-1 group-hover:translate-x-0 group-focus-visible:translate-x-0'
              : tooltip === 'right'
                ? 'left-full ml-1.5 top-1/2 -translate-y-1/2 -translate-x-1 group-hover:translate-x-0 group-focus-visible:translate-x-0'
                : tooltip === 'logo-tr'
                  ? 'bottom-[calc(100%-6px)] left-[calc(100%-4px)]'
                  : 'top-[calc(100%-6px)] left-[calc(100%-4px)]'
        }`}
      >
        {done ? 'Matché !' : <MatcherWord />}
      </span>
    </button>
  );
}
