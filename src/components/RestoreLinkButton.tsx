/** Bouton rapide Rétablir le lien — chaîne ouverte au repos, refermée au survol. */
export default function RestoreLinkButton({
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
  tooltip?: 'left' | 'top' | 'right' | 'logo' | 'logo-tr';
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
      aria-label={`Rétablir le lien avec ${name}`}
      className="group relative z-10 w-9 h-9 flex items-center justify-center flex-shrink-0 overflow-visible bg-transparent hover:z-20 cursor-pointer disabled:cursor-default disabled:opacity-40"
    >
      <span className="restore-chain-capsule pointer-events-none relative flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm">
        <svg
          viewBox="0 0 24 24"
          className="restore-chain w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <g className="restore-chain-left">
            <path d="M9 17H7A5 5 0 0 1 7 7h2" />
          </g>
          <g className="restore-chain-right">
            <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
          </g>
          <path className="restore-chain-bar" d="M8 12h8" />
        </svg>
      </span>
      <span
        className={`pointer-events-none absolute z-30 whitespace-nowrap rounded-full border border-slate-100 bg-white/95 px-2 py-0.5 text-[11px] font-medium tracking-wide text-slate-600 shadow-sm opacity-0 transition-all duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100 ${
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
        Rétablir le lien
      </span>
    </button>
  );
}
