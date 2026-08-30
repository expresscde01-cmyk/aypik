import { Hourglass } from 'lucide-react';

/** Bouton rapide Attendre — capsule jaune vif, sablier sombre, comme le R. */
export default function WaitButton({
  disabled,
  busy,
  onClick,
  name,
  tooltip = 'logo-tr',
}: {
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
  name: string;
  tooltip?: 'right' | 'top' | 'left' | 'logo' | 'logo-tr';
}) {
  const blocked = Boolean(disabled || busy);

  return (
    <button
      type="button"
      onClick={() => {
        if (blocked) return;
        onClick();
      }}
      disabled={blocked}
      aria-label={`Mettre ${name} en attente`}
      className="group relative z-10 w-9 h-9 flex items-center justify-center flex-shrink-0 overflow-visible bg-transparent hover:z-20 cursor-pointer disabled:cursor-default disabled:opacity-40"
    >
      <span className="wait-hourglass-disc pointer-events-none relative flex h-8 w-8 items-center justify-center rounded-full border border-gray-400 shadow-sm">
        <Hourglass
          className="wait-hourglass w-3.5 h-3.5 text-gray-500"
          strokeWidth={1.75}
          aria-hidden
        />
      </span>
      <span
        className={`pointer-events-none absolute z-30 whitespace-nowrap rounded-full border border-amber-100 bg-white/95 px-2 py-0.5 text-[11px] font-medium tracking-wide text-amber-800 shadow-sm opacity-0 transition-all duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 ${
          tooltip === 'top'
            ? 'bottom-full left-1/2 mb-1.5 -translate-x-1/2 translate-y-1 group-hover:translate-y-0 group-focus-visible:translate-y-0'
            : tooltip === 'right'
              ? 'left-full ml-1.5 top-1/2 -translate-y-1/2 -translate-x-1 group-hover:translate-x-0 group-focus-visible:translate-x-0'
              : tooltip === 'left'
                ? 'right-full mr-1.5 top-1/2 -translate-y-1/2 translate-x-1 group-hover:translate-x-0 group-focus-visible:translate-x-0'
                : tooltip === 'logo-tr'
                  ? 'bottom-[calc(100%-6px)] left-[calc(100%-4px)]'
                  : 'top-[calc(100%-6px)] left-[calc(100%-4px)]'
        }`}
      >
        Attendre
      </span>
    </button>
  );
}
