/** Bouton rapide Refuser (R) — secondaire vs Matcher (M), zone tactile confortable. */
export default function RefuseButton({
  disabled,
  busy,
  onClick,
  name,
  tooltip = 'top',
}: {
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
  name: string;
  tooltip?: 'right' | 'top';
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
      aria-label={`Refuser ${name}`}
      title="Refuser"
      className="group relative z-10 w-9 h-9 flex items-center justify-center flex-shrink-0 bg-transparent hover:z-20 cursor-pointer disabled:cursor-default disabled:opacity-40"
    >
      <span className="pointer-events-none relative flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition-colors group-hover:border-rose-200 group-hover:bg-rose-50 group-focus-visible:border-rose-200 group-focus-visible:bg-rose-50">
        <span className="text-[0.95rem] font-semibold leading-none tracking-tight text-gray-500 group-hover:text-rose-600 group-focus-visible:text-rose-600">
          R
        </span>
      </span>
      <span
        className={`pointer-events-none absolute whitespace-nowrap rounded-full border border-gray-200 bg-white/95 px-2 py-0.5 text-[11px] font-medium tracking-wide text-gray-700 shadow-sm opacity-0 transition-all duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 ${
          tooltip === 'top'
            ? 'bottom-full left-1/2 mb-1.5 -translate-x-1/2 translate-y-1 group-hover:translate-y-0 group-focus-visible:translate-y-0'
            : 'left-full ml-1.5 top-1/2 -translate-y-1/2 -translate-x-1 group-hover:translate-x-0 group-focus-visible:translate-x-0'
        }`}
      >
        Refuser
      </span>
    </button>
  );
}
