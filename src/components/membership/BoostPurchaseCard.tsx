import { useState } from 'react';
import { Zap } from 'lucide-react';
import { SoftLock } from '@/components/membership/SoftPremium';
import { PaymentCheckoutModal } from '@/components/membership/PaymentCheckoutModal';
import {
  isFounderComplimentaryAccess,
  type MembershipStatus,
} from '@/lib/membership';
import { ENABLE_PAYMENTS, requiresPaidCheckout } from '@/lib/payments';

export function BoostPurchaseCard({
  status,
  hasBoost,
  boostEndsAt,
  purchaseDisabled = false,
  purchaseDisabledReason = 'Non sélectionné - votre offre Freemium est active',
  onPaymentSuccess,
  /** Activation gratuite (Fondateur) — sans Stripe/PayPal. */
  onComplimentaryActivate,
  complimentaryActivating = false,
}: {
  status: MembershipStatus;
  hasBoost: boolean;
  boostEndsAt: string | null;
  /** Grisé / non achetable (ex. Freemium active sans boost déjà acheté). */
  purchaseDisabled?: boolean;
  purchaseDisabledReason?: string;
  onPaymentSuccess?: () => void;
  onComplimentaryActivate?: () => Promise<string | null> | void;
  complimentaryActivating?: boolean;
}) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const complimentary = isFounderComplimentaryAccess(status);
  const canPay = requiresPaidCheckout(status, 'boost');

  const handleComplimentary = async () => {
    if (!onComplimentaryActivate) return;
    setLocalError(null);
    const err = await onComplimentaryActivate();
    if (err) setLocalError(err);
    else onPaymentSuccess?.();
  };

  return (
    <>
      <div
        aria-disabled={purchaseDisabled || undefined}
        className={
          purchaseDisabled
            ? 'rounded-2xl border border-gray-200 bg-gray-50 p-4 opacity-55 grayscale pointer-events-none select-none'
            : complimentary
              ? 'rounded-2xl border border-amber-200 bg-amber-50/40 p-4'
              : 'rounded-2xl border border-amber-100 bg-white p-4'
        }
      >
        <div className="flex items-start gap-3">
          <div
            className={
              purchaseDisabled
                ? 'w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center flex-shrink-0'
                : 'w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0'
            }
          >
            <Zap
              className={
                purchaseDisabled
                  ? 'w-5 h-5 text-gray-500'
                  : 'w-5 h-5 text-amber-600'
              }
              fill="currentColor"
            />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">Boost 24 h</h3>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              {complimentary
                ? 'Mettez votre profil en avant pendant une journée — offert avec votre statut Fondateur (0 €).'
                : 'Mettez votre profil en avant pendant une journée. Achat ponctuel, sans abonnement — paiement carte ou PayPal.'}
            </p>

            {hasBoost && boostEndsAt && (
              <p
                className={
                  purchaseDisabled
                    ? 'text-xs text-gray-600 font-medium mt-2'
                    : 'text-xs text-amber-700 font-medium mt-2'
                }
              >
                Actif jusqu’au{' '}
                {new Date(boostEndsAt).toLocaleString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}

            {purchaseDisabled && (
              <p className="text-xs font-medium text-gray-700 leading-relaxed mt-2 bg-white/70 border border-gray-200 rounded-xl px-3 py-2">
                {purchaseDisabledReason}
              </p>
            )}

            {localError && (
              <p className="text-xs text-red-600 mt-2">{localError}</p>
            )}

            <div className="flex items-center gap-3 mt-3">
              {purchaseDisabled ? (
                <div
                  role="presentation"
                  aria-hidden="true"
                  className="px-3.5 py-2 rounded-xl border border-gray-200 bg-gray-100 text-gray-400 text-xs font-semibold cursor-not-allowed"
                >
                  {hasBoost ? 'Prolonger 24 h · 2,99 €' : 'Activer 24 h · 2,99 €'}
                </div>
              ) : complimentary ? (
                <button
                  type="button"
                  onClick={() => void handleComplimentary()}
                  disabled={complimentaryActivating || !onComplimentaryActivate}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  {complimentaryActivating
                    ? 'Activation…'
                    : hasBoost
                      ? 'Prolonger 24 h · offert'
                      : 'Activer 24 h · offert'}
                </button>
              ) : !ENABLE_PAYMENTS || !canPay ? (
                <div className="px-3.5 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs font-semibold">
                  Paiement bientôt disponible
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCheckoutOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors"
                >
                  {hasBoost
                    ? 'Prolonger 24 h · 2,99 €'
                    : 'Activer 24 h · 2,99 €'}
                </button>
              )}
              <SoftLock
                label={
                  complimentary
                    ? 'Fondateur · 0 €'
                    : !ENABLE_PAYMENTS
                      ? 'Bientôt'
                      : 'Carte ou PayPal'
                }
              />
            </div>
          </div>
        </div>
      </div>

      {!purchaseDisabled && canPay && (
        <PaymentCheckoutModal
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          status={status}
          product="boost"
          onSuccess={onPaymentSuccess}
        />
      )}
    </>
  );
}
