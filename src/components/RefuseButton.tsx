import { useState } from 'react';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';

/** Bouton rapide Supprimer — poubelle, avec confirmation obligatoire. */
export default function RefuseButton({
  disabled,
  busy,
  onClick,
  name,
  label = 'Supprimer',
  tooltip,
}: {
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
  name: string;
  tooltip?: 'right' | 'top' | 'left' | 'logo' | 'logo-tr';
  label?: string;
}) {
  const blocked = Boolean(disabled || busy);
  const tip = tooltip ?? 'logo';
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (blocked) return;
          setConfirmOpen(true);
        }}
        disabled={blocked}
        aria-label={`${label} ${name}`}
        className="group relative z-10 w-9 h-9 flex items-center justify-center flex-shrink-0 overflow-visible bg-transparent hover:z-20 cursor-pointer disabled:cursor-default disabled:opacity-40"
      >
        <span className="pointer-events-none relative flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition-colors group-hover:border-rose-200 group-hover:bg-rose-50 group-focus-visible:border-rose-200 group-focus-visible:bg-rose-50">
          <svg
            viewBox="0 0 24 24"
            className="refuse-trash w-3.5 h-3.5 text-gray-500 group-hover:text-rose-600 group-focus-visible:text-rose-600"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <g className="refuse-trash-lid">
              <path d="M3 6h18" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </g>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <line x1="10" x2="10" y1="11" y2="17" />
            <line x1="14" x2="14" y1="11" y2="17" />
          </svg>
        </span>
        <span
          className={`pointer-events-none absolute z-30 whitespace-nowrap rounded-full border border-gray-100 bg-white/95 px-2 py-0.5 text-[11px] font-medium tracking-wide text-gray-600 shadow-sm opacity-0 transition-all duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 ${
            tip === 'top'
              ? 'bottom-full left-1/2 mb-1.5 -translate-x-1/2 translate-y-1 group-hover:translate-y-0 group-focus-visible:translate-y-0'
              : tip === 'right'
                ? 'left-full ml-1.5 top-1/2 -translate-y-1/2 -translate-x-1 group-hover:translate-x-0 group-focus-visible:translate-x-0'
                : tip === 'left'
                  ? 'right-full mr-1.5 top-1/2 -translate-y-1/2 translate-x-1 group-hover:translate-x-0 group-focus-visible:translate-x-0'
                  : tip === 'logo-tr'
                    ? 'bottom-[calc(100%-6px)] left-[calc(100%-4px)]'
                    : 'top-[calc(100%-6px)] left-[calc(100%-4px)]'
          }`}
        >
          {label}
        </span>
      </button>
      {confirmOpen ? (
        <ConfirmDeleteModal
          busy={busy}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onClick();
          }}
        />
      ) : null}
    </>
  );
}
