import { Ban, EyeOff, PauseCircle, type LucideIcon } from 'lucide-react';
import type { AccountStatusId } from '@/lib/accountStatus';

type StatusVariant = {
  label: string;
  title: string;
  Icon: LucideIcon;
  className: string;
};

/** Variantes visuelles — ajouter une entrée ici pour un nouveau statut. */
export const ACCOUNT_STATUS_VARIANTS: Record<AccountStatusId, StatusVariant> = {
  paused: {
    label: 'Hors découverte',
    title: 'Hors découverte — changer la visibilité',
    Icon: PauseCircle,
    className:
      'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100',
  },
  deactivated: {
    label: 'Compte désactivé',
    title: 'Compte désactivé — changer la visibilité',
    Icon: Ban,
    className: 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200',
  },
  incognito: {
    label: 'Incognito',
    title: 'Mode Incognito — changer la visibilité',
    Icon: EyeOff,
    className:
      'bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100',
  },
};

export function AccountStatusBadge({
  status,
  onClick,
}: {
  status: AccountStatusId;
  onClick?: () => void;
}) {
  const variant = ACCOUNT_STATUS_VARIANTS[status];
  const Icon = variant.Icon;
  return (
    <button
      type="button"
      title={variant.title}
      aria-label={variant.title}
      onClick={onClick}
      className={`inline-flex items-center gap-1 h-6 pl-1 pr-2 rounded-full border text-[11px] font-semibold shrink-0 transition-colors ${variant.className}`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {variant.label}
    </button>
  );
}

export function AccountStatusBadges({
  statuses,
  onSelect,
}: {
  statuses: AccountStatusId[];
  onSelect?: (id: AccountStatusId) => void;
}) {
  if (statuses.length === 0) return null;
  return (
    <div className="flex items-center justify-center gap-1.5 min-w-0">
      {statuses.map((id) => (
        <AccountStatusBadge
          key={id}
          status={id}
          onClick={() => onSelect?.(id)}
        />
      ))}
    </div>
  );
}
