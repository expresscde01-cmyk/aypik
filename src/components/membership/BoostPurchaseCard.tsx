import { useState } from 'react';
import { Zap, AlertCircle } from 'lucide-react';
import { SoftLock } from '@/components/membership/SoftPremium';

export function BoostPurchaseCard({
  hasBoost,
  boostEndsAt,
  onPurchase,
}: {
  hasBoost: boolean;
  boostEndsAt: string | null;
  onPurchase: () => Promise<string | null>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleBuy = async () => {
    setError(null);
    setLoading(true);
    const err = await onPurchase();
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setDone(true);
  };

  return (
    <div className="rounded-2xl border border-amber-100 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
          <Zap className="w-5 h-5 text-amber-600" fill="currentColor" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">Boost 24 h</h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Mettez votre profil en avant pendant une journée. Achat ponctuel,
            disponible à tout moment — y compris pendant l’offre Fondateur.
          </p>

          {hasBoost && boostEndsAt && (
            <p className="text-xs text-amber-700 font-medium mt-2">
              Actif jusqu’au{' '}
              {new Date(boostEndsAt).toLocaleString('fr-FR', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}

          {error && (
            <div className="flex items-start gap-1.5 mt-2 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {done && !error && (
            <p className="text-xs text-green-700 mt-2 font-medium">
              Boost activé — votre profil est mis en avant.
            </p>
          )}

          <div className="flex items-center gap-3 mt-3">
            <button
              type="button"
              onClick={handleBuy}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors disabled:opacity-60"
            >
              {loading
                ? 'Activation...'
                : hasBoost
                  ? 'Prolonger 24 h · 2,99 €'
                  : 'Activer 24 h · 2,99 €'}
            </button>
            <SoftLock label="Achat unique" />
          </div>
        </div>
      </div>
    </div>
  );
}
