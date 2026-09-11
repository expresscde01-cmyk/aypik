import { Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useMembership } from '@/lib/useMembership';
import { dateLocale } from '@/i18n/format';
import { useTranslation } from 'react-i18next';

export function formatBoostUntil(iso: string): {
  short: string;
  full: string;
  date: string;
} {
  const d = new Date(iso);
  const short = d.toLocaleDateString(dateLocale(), {
    day: 'numeric',
    month: 'short',
  });
  const date = d.toLocaleDateString(dateLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const full = d.toLocaleString(dateLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return { short, full, date };
}

/** Indicateur d’en-tête : visible uniquement par le titulaire du compte. */
export default function OwnerBoostIndicator({
  iconOnlyOnMobile = false,
  shortLabel = false,
}: {
  /** Accueil mobile : icône seule pour ne pas chevaucher le logo. */
  iconOnlyOnMobile?: boolean;
  /** Pages secondaires mobile : icône + « Boosté », sans la date. */
  shortLabel?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { status } = useMembership();

  if (!user || !status.has_boost) return null;

  const until = status.boost_ends_at
    ? formatBoostUntil(status.boost_ends_at)
    : null;
  const label = until
    ? t('membership.boostUntil', { date: until.full })
    : t('membership.boostActive');
  const visible = shortLabel
    ? t('membership.boosted')
    : until
      ? t('membership.boostUntilShort', { date: until.short })
      : t('membership.boostActive');
  const hideTextOnMobile = iconOnlyOnMobile && !shortLabel;

  return (
    <span
      className={`inline-flex items-center gap-1 h-6 rounded-full border text-[11px] font-semibold shrink-0 bg-[#FFEDD5] text-[#8A6D1D] border-[#8A6D1D] ${
        hideTextOnMobile
          ? 'pl-1 pr-1 sm:pr-2 sm:max-w-none'
          : 'pl-1 pr-2 max-w-[13rem] sm:max-w-none'
      }`}
      title={label}
      aria-label={label}
    >
      <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden />
      <span className={`truncate ${hideTextOnMobile ? 'hidden sm:inline' : ''}`}>
        {visible}
      </span>
    </span>
  );
}
