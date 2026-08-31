import { Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useMembership } from '@/lib/useMembership';

function formatBoostUntil(iso: string): { short: string; full: string } {
  const d = new Date(iso);
  const short = d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
  const full = d.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return { short, full };
}

/** Indicateur d’en-tête : visible uniquement par le titulaire du compte. */
export default function OwnerBoostIndicator({
  iconOnlyOnMobile = false,
}: {
  /** Accueil mobile : icône seule pour ne pas chevaucher le logo. */
  iconOnlyOnMobile?: boolean;
}) {
  const { user } = useAuth();
  const { status } = useMembership();

  if (!user || !status.has_boost) return null;

  const until = status.boost_ends_at
    ? formatBoostUntil(status.boost_ends_at)
    : null;
  const label = until
    ? `Boost actif jusqu’au ${until.full}`
    : 'Boost actif';
  const visible = until ? `Boost jusqu’au ${until.short}` : 'Boost actif';

  return (
    <span
      className={`inline-flex items-center gap-1 h-6 rounded-full border text-[11px] font-semibold shrink-0 bg-[#FFEDD5] text-[#8A6D1D] border-[#8A6D1D] ${
        iconOnlyOnMobile
          ? 'pl-1 pr-1 sm:pr-2 sm:max-w-none'
          : 'pl-1 pr-2 max-w-[13rem] sm:max-w-none'
      }`}
      title={label}
      aria-label={label}
    >
      <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden />
      <span
        className={`truncate ${iconOnlyOnMobile ? 'hidden sm:inline' : ''}`}
      >
        {visible}
      </span>
    </span>
  );
}
