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

const FOUNDER_LOCK_REASON =
  "Inaccessible : l'offre Fondateur inclut déjà tous les avantages Premium gratuitement";

export function PremiumConversionCard({
  status,
  founderExpired = false,
  onPaymentSuccess,
  tone = 'primary',
  disabled = false,
  disabledReason = FOUNDER_LOCK_REASON,
}: {
  status: MembershipStatus;
  founderExpired?: boolean;
  onPaymentSuccess?: () => void;
  /** primary = CTA proéminent ; secondary = offre payante discrète sous l’offre Fondateur */
  tone?: 'primary' | 'secondary';
  /** Grisé / non cliquable (ex. pendant la période Fondateur) */
  disabled?: boolean;
  disabledReason?: string;
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

  const activeLabel = founderExpired
    ? `Choisir Premium · ${priceLabel}`
    : secondary
      ? `Soutenir plus tard · ${priceLabel}`
      : `Passer à Premium · ${priceLabel}`;

  /** Ancrage de prix purement décoratif quand Fondateur est actif */
  const lockedLabel = `Offre Premium · ${priceLabel}`;

  return (
    <>
      <div
        aria-disabled={disabled || undefined}
        className={
          disabled
            ? 'rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden opacity-55 grayscale pointer-events-none select-none'
            : secondary
              ? 'rounded-2xl border border-gray-200 bg-white overflow-hidden'
              : 'rounded-2xl border border-rose-200 bg-white overflow-hidden shadow-sm shadow-rose-50'
        }
      >
        <div
          className={
            disabled || secondary
              ? 'bg-gray-100 px-4 py-3 border-b border-gray-200'
              : 'bg-gradient-to-r from-rose-500 to-amber-500 px-4 py-3 text-white'
          }
        >
          <p
            className={
              disabled || secondary
                ? 'text-xs font-medium text-gray-500'
                : 'text-xs font-medium text-white/90'
            }
          >
            {founderExpired
              ? 'Premium optionnel — sans reconduction forcée'
              : disabled || secondary
                ? 'Premium optionnel'
                : 'Abonnement Premium'}
          </p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span
              className={
                disabled || secondary
                  ? 'text-lg font-bold tracking-tight text-gray-800'
                  : 'text-2xl font-bold tracking-tight'
              }
            >
              {amount}
            </span>
            <span
              className={
                disabled || secondary
                  ? 'text-sm text-gray-500'
                  : 'text-sm text-white/90'
              }
            >
              / mois
            </span>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-600 leading-relaxed">
            {founderExpired
              ? 'Choix volontaire uniquement : Freemium, Premium ou interrompre votre adhésion — sans engagement ni reconduction automatique.'
              : "Premium à 19,99 € / mois pour un confort d'utilisation, sans engagement."}
          </p>

          {disabled && (
            <p className="text-xs font-medium text-gray-700 leading-relaxed bg-white/70 border border-gray-200 rounded-xl px-3 py-2">
              {disabledReason}
            </p>
          )}

          <ul className="space-y-1.5">
            {PREMIUM_PERKS.map((perk) => (
              <li
                key={perk}
                className="flex items-center gap-2 text-xs text-gray-600"
              >
                <Check
                  className={
                    disabled || secondary
                      ? 'w-3.5 h-3.5 text-gray-400 flex-shrink-0'
                      : 'w-3.5 h-3.5 text-rose-500 flex-shrink-0'
                  }
                />
                {perk}
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            {disabled ? (
              <div
                role="presentation"
                aria-hidden="true"
                className="w-full py-2.5 rounded-xl border border-gray-200 bg-gray-100 text-gray-400 text-sm font-semibold text-center cursor-not-allowed"
              >
                {lockedLabel}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCheckoutOpen(true)}
                className={
                  secondary
                    ? 'w-full py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors'
                    : 'w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white text-sm font-semibold hover:opacity-95 transition-opacity'
                }
              >
                {activeLabel}
              </button>
            )}

            {!disabled && (
              <>
                <p className="text-xs text-center text-gray-500 leading-relaxed">
                  Sans engagement · résiliable à tout moment · aucune
                  reconduction forcée
                </p>
                <p className="text-[10px] text-center text-gray-400 leading-relaxed">
                  Paiement sécurisé par carte (Stripe) ou PayPal ·{' '}
                  <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors">
                    CGU / CGV
                  </LegalLink>
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {!disabled && (
        <PaymentCheckoutModal
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          status={status}
          onSuccess={onPaymentSuccess}
        />
      )}
    </>
  );
}
