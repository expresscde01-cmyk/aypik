import { Eye, Filter, Heart, Lock } from 'lucide-react';
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
      ? `${count} personne${count > 1 ? 's' : ''} vous a${count > 1 ? 'iment' : ''} liké. Découvrez qui — c’est inclus dans ${namedOffer}.`
      : `Quand quelqu’un vous likera, vous pourrez le découvrir — c’est inclus dans ${namedOffer}.`
    : count > 0
      ? SITE_FREE_MODE
        ? `${count} personne${count > 1 ? 's' : ''} vous a${count > 1 ? 'iment' : ''} liké.`
        : `${count} personne${count > 1 ? 's' : ''} vous a${count > 1 ? 'iment' : ''} liké. Découvrez qui avec Premium${
            priceLabel ? ` (${priceLabel})` : ''
          }.`
      : SITE_FREE_MODE
        ? 'Quand quelqu’un vous likera, vous pourrez le découvrir ici.'
        : 'Quand quelqu’un vous likera, vous pourrez le découvrir avec Premium.';

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 relative overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-rose-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Qui vous a liké
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
}: {
  locked: boolean;
  onAskPremium?: () => void;
  priceLabel?: string;
  status: MembershipStatus;
}) {
  const short = offerShortName(status);
  const included = offerIncludesPremiumPerks(status);
  const title = included
    ? `Filtres avancés & avantages ${short}`
    : 'Filtres avancés';

  if (!locked) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 text-xs text-emerald-800">
        <Filter className="w-4 h-4 text-emerald-700" />
        Filtres avancés
      </div>
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
            ? `Les likes illimités sont inclus dans ${namedOffer}. Réessayez dans un instant.`
            : priceLabel
              ? `Revenez demain, ou passez à Premium (${priceLabel}) pour liker sans limite — à votre rythme.`
              : SITE_FREE_MODE
                ? 'Revenez demain pour liker à nouveau — à votre rythme.'
                : 'Revenez demain, ou passez à Premium pour liker sans limite — à votre rythme.'
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
