import { Hourglass } from 'lucide-react';

/** Bouton rapide Attendre — capsule jaune vif, sablier sombre, comme le R. */
export default function WaitButton({
  disabled,
  busy,
  onClick,
  name,
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
      aria-label={`Mettre ${name} en attente`}
      title="Attendre"
      className="group relative z-10 w-9 h-9 flex items-center justify-center flex-shrink-0 overflow-visible bg-transparent hover:z-20 cursor-pointer disabled:cursor-default disabled:opacity-40"
    >
      <span className="pointer-events-none relative flex h-8 w-8 items-center justify-center rounded-full border border-gray-400 bg-[#FFC107] shadow-sm transition-colors group-hover:bg-[#FFD54F] group-focus-visible:bg-[#FFD54F]">
        <Hourglass
          className="wait-hourglass w-3.5 h-3.5 text-gray-500"
          strokeWidth={1.75}
          aria-hidden
        />
      </span>
    </button>
  );
}
