import { ChevronDown, Eye, Filter, Heart, Lock } from 'lucide-react';
import { SoftLock, SoftPremiumBanner } from '@/components/membership/SoftPremium';
import {
  SITE_FREE_MODE,
  offerLabel,
  offerShortName,
} from '@/lib/founderCopy';
import {
  formatPremiumPriceLabel,
  isFounderPeriodActive,
  type MembershipStatus,
} from '@/lib/membership';

function offerIncludesPremiumPerks(status: MembershipStatus): boolean {
  return isFounderPeriodActive(status) || status.plan === 'premium';
}

export function WhoLikedTeaser({
  locked,
  count,
  priceLabel,
  status,
}: {
  locked: boolean;
  count: number;
  priceLabel?: string;
  status: MembershipStatus;
}) {
  if (!locked) return null;

  const namedOffer = offerLabel(status);
  const included = offerIncludesPremiumPerks(status);
  const lockLabel =
    !SITE_FREE_MODE && priceLabel
      ? `Premium · ${priceLabel}`
      : included
        ? `Inclus dans ${namedOffer}`
        : SITE_FREE_MODE
          ? 'Aperçu'
          : 'Inclus avec Premium';

  const body = included
    ? count > 0
      ? `${count} personne${count > 1 ? 's' : ''} t'${count > 1 ? 'ont' : 'a'} liké. Découvre qui — c’est inclus dans ${namedOffer}.`
      : `Quand quelqu’un te likera, tu pourras le découvrir — c’est inclus dans ${namedOffer}.`
    : count > 0
      ? SITE_FREE_MODE
        ? `${count} personne${count > 1 ? 's' : ''} t'${count > 1 ? 'ont' : 'a'} liké.`
        : `${count} personne${count > 1 ? 's' : ''} t'${count > 1 ? 'ont' : 'a'} liké. Découvre qui avec Premium${
            priceLabel ? ` (${priceLabel})` : ''
          }.`
      : SITE_FREE_MODE
        ? 'Quand quelqu’un te likera, tu pourras le découvrir ici.'
        : 'Quand quelqu’un te likera, tu pourras le découvrir avec Premium.';

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 relative overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-rose-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Qui t'a liké
          </h3>
        </div>
        <SoftLock label={lockLabel} />
      </div>

      <div className="flex -space-x-2 mb-3 blur-[3px] select-none pointer-events-none opacity-70">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-200 to-amber-200 border-2 border-white"
          />
        ))}
        {count > 0 && (
          <div className="w-10 h-10 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs font-semibold text-gray-500">
            +{count}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">{body}</p>
    </div>
  );
}

export function AdvancedFiltersTeaser({
  locked,
  onAskPremium,
  priceLabel,
  status,
  expanded = false,
  onToggle,
  activeCount = 0,
}: {
  locked: boolean;
  onAskPremium?: () => void;
  priceLabel?: string;
  status: MembershipStatus;
  expanded?: boolean;
  onToggle?: () => void;
  activeCount?: number;
}) {
  const short = offerShortName(status);
  const included = offerIncludesPremiumPerks(status);
  const title = included
    ? `Filtres avancés & avantages ${short}`
    : 'Filtres avancés';

  if (!locked) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls="discovery-filters-panel"
        className={`w-full rounded-2xl border p-3 flex items-center justify-between text-left transition-colors ${
          expanded
            ? 'border-emerald-400 bg-emerald-100 text-emerald-900 shadow-inner'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70'
        }`}
      >
        <span className="flex items-center gap-2 text-xs font-semibold">
          <Filter className="w-4 h-4 text-emerald-700" />
          Filtres avancés
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-emerald-600 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>
    );
  }

  if (SITE_FREE_MODE) return null;

  const badge =
    !SITE_FREE_MODE && priceLabel
      ? priceLabel
      : included
        ? short
        : SITE_FREE_MODE
          ? null
          : 'Premium';

  return (
    <button
      type="button"
      onClick={onAskPremium}
      className="w-full rounded-2xl border border-dashed border-gray-200 bg-white p-3 flex items-center justify-between text-left hover:border-rose-200 transition-colors"
    >
      <span className="flex items-center gap-2 text-sm text-gray-600">
        <Filter className="w-4 h-4 text-gray-400" />
        {title}
      </span>
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <Lock className="w-3.5 h-3.5" />
        {badge}
      </span>
    </button>
  );
}

export function LikesQuotaHint({ status }: { status: MembershipStatus }) {
  const priceLabel = SITE_FREE_MODE
    ? undefined
    : formatPremiumPriceLabel(
        status.premium_price_cents,
        status.premium_currency,
        status.premium_interval
      );
  const namedOffer = offerLabel(status);
  const short = offerShortName(status);
  const included = offerIncludesPremiumPerks(status);

  if (isFounderPeriodActive(status)) {
    return null;
  }

  if (status.unlimited_likes) {
    return (
      <p className="text-center text-xs text-gray-400">
        Likes illimités ·{' '}
        <span className="text-rose-500 font-medium">{short}</span>
      </p>
    );
  }

  const remaining = status.likes_remaining_today ?? 0;

  if (remaining <= 0) {
    return (
      <SoftPremiumBanner
        title="Limite de likes atteinte pour aujourd’hui"
        description={
          included
            ? `Les likes illimités sont inclus dans ${namedOffer}. Réessaie dans un instant.`
            : priceLabel
              ? `Reviens demain, ou passe à Premium (${priceLabel}) pour liker sans limite — à ton rythme.`
              : SITE_FREE_MODE
                ? 'Reviens demain pour liker à nouveau — à ton rythme.'
                : 'Reviens demain, ou passe à Premium pour liker sans limite — à ton rythme.'
        }
        priceLabel={priceLabel}
      />
    );
  }

  if (remaining <= 3) {
    return (
      <p className="text-center text-xs text-amber-600">
        Plus que {remaining} like{remaining > 1 ? 's' : ''} aujourd’hui ·{' '}
        <Heart className="w-3 h-3 inline" />
      </p>
    );
  }

  return (
    <p className="text-center text-xs text-gray-400">
      {remaining} likes restants aujourd’hui
    </p>
  );
}
