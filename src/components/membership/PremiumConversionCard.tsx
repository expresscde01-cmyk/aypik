import { useState } from 'react';
import { Check } from 'lucide-react';
import {
  formatPremiumPriceLabel,
  formatPriceCents,
  type MembershipStatus,
} from '@/lib/membership';
import { PaymentCheckoutModal } from '@/components/membership/PaymentCheckoutModal';
import { LegalLink } from '@/components/LegalTerms';

const PREMIUM_PERKS = [
  'Voir qui a liké votre profil',
  'Filtres géographiques & centres d’intérêt',
  'Likes illimités',
];

export function PremiumConversionCard({
  status,
  founderExpired = false,
  onPaymentSuccess,
  tone = 'primary',
}: {
  status: MembershipStatus;
  founderExpired?: boolean;
  onPaymentSuccess?: () => void;
  /** primary = CTA proéminent ; secondary = offre payante discrète sous l’offre Fondateur */
  tone?: 'primary' | 'secondary';
}) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const priceLabel = formatPremiumPriceLabel(
    status.premium_price_cents,
    status.premium_currency,
    status.premium_interval
  );
  const amount = formatPriceCents(
    status.premium_price_cents,
    status.premium_currency
  );
  const secondary = tone === 'secondary';

  return (
    <>
      <div
        className={
          secondary
            ? 'rounded-2xl border border-gray-200 bg-white overflow-hidden'
            : 'rounded-2xl border border-rose-200 bg-white overflow-hidden shadow-sm shadow-rose-50'
        }
      >
        <div
          className={
            secondary
              ? 'bg-gray-100 px-4 py-3 border-b border-gray-200'
              : 'bg-gradient-to-r from-rose-500 to-amber-500 px-4 py-3 text-white'
          }
        >
          <p
            className={
              secondary
                ? 'text-xs font-medium text-gray-500'
                : 'text-xs font-medium text-white/90'
            }
          >
            {founderExpired
              ? 'Reconduction Premium (optionnelle)'
              : secondary
                ? 'Premium optionnel'
                : 'Abonnement Premium'}
          </p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span
              className={
                secondary
                  ? 'text-lg font-bold tracking-tight text-gray-800'
                  : 'text-2xl font-bold tracking-tight'
              }
            >
              {amount}
            </span>
            <span
              className={
                secondary ? 'text-sm text-gray-500' : 'text-sm text-white/90'
              }
            >
              / mois
            </span>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-600 leading-relaxed">
            Premium à 19,99 € / mois pour un confort d&apos;utilisation, sans
            engagement.
          </p>

          <ul className="space-y-1.5">
            {PREMIUM_PERKS.map((perk) => (
              <li
                key={perk}
                className="flex items-center gap-2 text-xs text-gray-600"
              >
                <Check
                  className={
                    secondary
                      ? 'w-3.5 h-3.5 text-gray-400 flex-shrink-0'
                      : 'w-3.5 h-3.5 text-rose-500 flex-shrink-0'
                  }
                />
                {perk}
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              className={
                secondary
                  ? 'w-full py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors'
                  : 'w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white text-sm font-semibold hover:opacity-95 transition-opacity'
              }
            >
              {founderExpired
                ? `Reprendre Premium · ${priceLabel}`
                : secondary
                  ? `Soutenir plus tard · ${priceLabel}`
                  : `Passer à Premium · ${priceLabel}`}
            </button>
            <p className="text-xs text-center text-gray-500 leading-relaxed">
              Sans engagement · résiliable à tout moment en un clic
            </p>
            <p className="text-[10px] text-center text-gray-400 leading-relaxed">
              Paiement sécurisé par carte (Stripe) ou PayPal ·{' '}
              <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors">
                CGU / CGV
              </LegalLink>
            </p>
          </div>
        </div>
      </div>

      <PaymentCheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        status={status}
        onSuccess={onPaymentSuccess}
      />
    </>
  );
}
