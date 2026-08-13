import { Lock, Sparkles } from 'lucide-react';
import { SITE_FREE_MODE } from '@/lib/founderCopy';

export function SoftPremiumBanner({
  title,
  description,
  onAction,
  actionLabel = 'Découvrir Premium',
  priceLabel,
}: {
  title: string;
  description: string;
  onAction?: () => void;
  actionLabel?: string;
  /** Tarif affiché dynamiquement, ex. « 19,99 € / mois » */
  priceLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-rose-100 bg-gradient-to-r from-rose-50 to-amber-50 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/80 flex items-center justify-center flex-shrink-0 border border-rose-100">
          <Sparkles className="w-4 h-4 text-rose-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            {!SITE_FREE_MODE && priceLabel && (
              <span className="flex-shrink-0 text-xs font-bold text-rose-600 bg-white/80 border border-rose-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                {priceLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
            {description}
          </p>
          {onAction && !SITE_FREE_MODE && (
            <button
              type="button"
              onClick={onAction}
              className="mt-2.5 text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors"
            >
              {actionLabel} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SoftLock({
  label = 'Inclus avec Premium',
}: {
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
      <Lock className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}
