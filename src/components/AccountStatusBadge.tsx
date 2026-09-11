import { Ban, EyeOff, PauseCircle, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AccountStatusId, VisibilityChoice } from '@/lib/accountStatus';

type StatusStyle = {
  Icon: LucideIcon;
  textClass: string;
  className: string;
};

/** Variantes visuelles — ajouter une entrée ici pour un nouveau statut. */
const ACCOUNT_STATUS_STYLES: Record<AccountStatusId, StatusStyle> = {
  paused: {
    Icon: PauseCircle,
    textClass: 'text-amber-800',
    className: 'bg-amber-50 border-amber-200 hover:bg-amber-100',
  },
  deactivated: {
    Icon: Ban,
    textClass: 'text-gray-700',
    className: 'bg-gray-100 border-gray-200 hover:bg-gray-200',
  },
  incognito: {
    Icon: EyeOff,
    textClass: 'text-violet-800',
    className: 'bg-violet-50 border-violet-200 hover:bg-violet-100',
  },
};

const ACCOUNT_STATUS_COPY = {
  paused: {
    label: 'profile.visibilityHintPaused',
    title: 'profile.badgePausedTitle',
  },
  deactivated: {
    label: 'profile.visibilityHintDeactivated',
    title: 'profile.badgeDeactivatedTitle',
  },
  incognito: {
    label: 'profile.visibilityIncognito',
    title: 'profile.badgeIncognitoTitle',
  },
} as const;

/** Couleur du libellé « Visibilité – {statut} » : même teinte que le badge header. */
export function visibilityHintTextClass(choice: VisibilityChoice): string {
  if (choice === 'visible') return 'text-emerald-600';
  return ACCOUNT_STATUS_STYLES[choice].textClass;
}

export function AccountStatusBadge({
  status,
  onClick,
}: {
  status: AccountStatusId;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  const variant = ACCOUNT_STATUS_STYLES[status];
  const copy = ACCOUNT_STATUS_COPY[status];
  const Icon = variant.Icon;
  const title = t(copy.title);
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1 h-6 pl-1 pr-2 rounded-full border text-[11px] font-semibold shrink-0 transition-colors ${variant.textClass} ${variant.className}`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {t(copy.label)}
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
