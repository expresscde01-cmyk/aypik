import { Eye, Filter, Heart, Lock } from 'lucide-react';
import { SoftLock, SoftPremiumBanner } from '@/components/membership/SoftPremium';
import {
  formatPremiumPriceLabel,
  type MembershipStatus,
} from '@/lib/membership';

export function WhoLikedTeaser({
  locked,
  count,
  priceLabel,
}: {
  locked: boolean;
  count: number;
  priceLabel?: string;
}) {
  if (!locked) return null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 relative overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-rose-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Qui vous a liké
          </h3>
        </div>
        <SoftLock
          label={priceLabel ? `Premium · ${priceLabel}` : 'Inclus avec Premium'}
        />
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

      <p className="text-xs text-gray-500 leading-relaxed">
        {count > 0
          ? `${count} personne${count > 1 ? 's' : ''} vous a${count > 1 ? 'iment' : ''} liké. Découvrez qui avec Premium${priceLabel ? ` (${priceLabel})` : ''}.`
          : 'Quand quelqu’un vous likera, vous pourrez le découvrir avec Premium.'}
      </p>
    </div>
  );
}

export function AdvancedFiltersTeaser({
  locked,
  onAskPremium,
  priceLabel,
}: {
  locked: boolean;
  onAskPremium?: () => void;
  priceLabel?: string;
}) {
  if (!locked) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-3 flex items-center gap-2 text-xs text-rose-700">
        <Filter className="w-4 h-4" />
        Filtres avancés & avantages Premium
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onAskPremium}
      className="w-full rounded-2xl border border-dashed border-gray-200 bg-white p-3 flex items-center justify-between text-left hover:border-rose-200 transition-colors"
    >
      <span className="flex items-center gap-2 text-sm text-gray-600">
        <Filter className="w-4 h-4 text-gray-400" />
        Filtres avancés & avantages Premium
      </span>
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <Lock className="w-3.5 h-3.5" />
        {priceLabel ?? 'Premium'}
      </span>
    </button>
  );
}

export function LikesQuotaHint({ status }: { status: MembershipStatus }) {
  const priceLabel = formatPremiumPriceLabel(
    status.premium_price_cents,
    status.premium_currency,
    status.premium_interval
  );

  if (status.unlimited_likes) {
    const label =
      status.on_founder_trial || status.is_founder
        ? 'Fondateur · 0 €'
        : 'Premium';
    return (
      <p className="text-center text-xs text-gray-400">
        Likes illimités ·{' '}
        <span className="text-rose-500 font-medium">{label}</span>
      </p>
    );
  }

  const remaining = status.likes_remaining_today ?? 0;

  if (remaining <= 0) {
    return (
      <SoftPremiumBanner
        title="Limite de likes atteinte pour aujourd’hui"
        description={`Revenez demain, ou passez à Premium (${priceLabel}) pour liker sans limite — à votre rythme.`}
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
