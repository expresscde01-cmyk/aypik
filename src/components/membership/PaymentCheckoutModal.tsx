import { useEffect, useState } from 'react';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import {
  CreditCard,
  X,
  ShieldCheck,
  AlertCircle,
  Check,
  Loader2,
} from 'lucide-react';
import {
  createPayPalSubscription,
  createStripeSubscription,
  getStripe,
  isPayPalConfigured,
  isStripeConfigured,
  type PaymentMethodChoice,
} from '@/lib/payments';
import {
  formatPremiumPriceLabel,
  formatPriceCents,
  type MembershipStatus,
} from '@/lib/membership';
import { LegalLink } from '@/components/LegalTerms';
import { SITE_FREE_MODE } from '@/lib/founderCopy';
import { useTranslation } from 'react-i18next';
import { widgetLanguage } from '@/i18n/format';

type Step = 'choose' | 'card' | 'paypal_redirect' | 'success';

export function PaymentCheckoutModal({
  open,
  onClose,
  status,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  status: MembershipStatus;
  onSuccess?: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethodChoice>('card');
  const [step, setStep] = useState<Step>('choose');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const { t } = useTranslation();

  const amount = formatPriceCents(
    status.premium_price_cents,
    status.premium_currency
  );
  const priceLabel = formatPremiumPriceLabel(
    status.premium_price_cents,
    status.premium_currency,
    status.premium_interval
  );

  useEffect(() => {
    if (!open) {
      setStep('choose');
      setError(null);
      setLoading(false);
      setClientSecret(null);
      setMethod('card');
    }
  }, [open]);

  if (SITE_FREE_MODE || !open) return null;

  const startCard = async () => {
    setError(null);
    if (!isStripeConfigured()) {
      setError(t('membership.stripeNotConfigured'));
      return;
    }
    setLoading(true);
    const result = await createStripeSubscription();
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setClientSecret(result.clientSecret);
    setStep('card');
  };

  const startPayPal = async () => {
    setError(null);
    if (!isPayPalConfigured()) {
      setError(
        t('membership.paypalNotConfigured')
      );
      return;
    }
    setLoading(true);
    setStep('paypal_redirect');
    const origin = window.location.origin;
    const result = await createPayPalSubscription({
      returnUrl: `${origin}/?paypal=success`,
      cancelUrl: `${origin}/?paypal=cancel`,
    });
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
      setStep('choose');
      return;
    }
    window.location.href = result.approveUrl;
  };

  const continuePayment = async () => {
    if (method === 'card') await startCard();
    else await startPayPal();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label={t('common.closeAria')}
        onClick={onClose}
      />

      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rose-100 max-h-[92vh] overflow-y-auto animate-fadeIn">
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2
              id="checkout-title"
              className="text-base font-bold text-gray-900"
            >
              {t('membership.checkoutTitle')}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('membership.checkoutSecure')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-400"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Récapitulatif */}
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {t('membership.subPremium')}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('membership.monthlyRenewal')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-gray-900">{amount}</p>
                <p className="text-xs text-gray-500">{t('membership.perMonth')}</p>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">
              {[
                t('membership.benefitWhoLiked'),
                t('membership.benefitFilters'),
                t('membership.benefitUnlimitedLikes'),
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-xs text-gray-600"
                >
                  <Check className="w-3.5 h-3.5 text-rose-500" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gray-600 leading-relaxed border-t border-gray-200 pt-3">
              <strong className="font-semibold text-gray-800">
                {t('membership.cancelAnytime')}
              </strong>{' '}
              {t('membership.checkoutTermsAfter')}{' '}
              <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors font-medium">
                {t('common.legalCguCgv')}
              </LegalLink>
              .
            </p>
          </div>

          {step === 'success' && (
            <div className="rounded-2xl bg-green-50 border border-green-100 p-4 text-center space-y-2">
              <p className="text-sm font-semibold text-green-800">
                {t('membership.paymentConfirmed')}
              </p>
              <p className="text-xs text-green-700">
                {t('membership.premiumActiveThanks', { price: priceLabel })}
              </p>
              <button
                type="button"
                onClick={() => {
                  onSuccess?.();
                  onClose();
                }}
                className="mt-2 w-full py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold"
              >
                {t('common.continue')}
              </button>
            </div>
          )}

          {step === 'choose' && (
            <>
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-2">
                  {t('membership.choosePayment')}
                </p>
                <div className="grid gap-2">
                  <PaymentOption
                    selected={method === 'card'}
                    onSelect={() => setMethod('card')}
                    title={t('membership.cardBank')}
                    subtitle={t('membership.cardBankHint')}
                    icon={<CreditCard className="w-5 h-5" />}
                    disabled={!isStripeConfigured()}
                    badge={!isStripeConfigured() ? t('membership.toConfigure') : undefined}
                  />
                  <PaymentOption
                    selected={method === 'paypal'}
                    onSelect={() => setMethod('paypal')}
                    title="PayPal"
                    subtitle={t('membership.paypalRedirect')}
                    icon={<PayPalMark />}
                    disabled={!isPayPalConfigured()}
                    badge={!isPayPalConfigured() ? t('membership.toConfigure') : undefined}
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="button"
                onClick={continuePayment}
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200 hover:opacity-95 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('membership.preparing')}
                  </>
                ) : method === 'card' ? (
                  t('membership.continuePrice', { price: priceLabel })
                ) : (
                  t('membership.continuePaypal', { price: priceLabel })
                )}
              </button>

              <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                {t('membership.cardEncrypted')}
              </p>
            </>
          )}

          {step === 'card' && clientSecret && (
            <Elements
              stripe={getStripe()}
              options={{
                clientSecret,
                locale: widgetLanguage(),
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: '#f43f5e',
                    borderRadius: '12px',
                  },
                },
              }}
            >
              <StripeCardForm
                priceLabel={priceLabel}
                onBack={() => {
                  setStep('choose');
                  setClientSecret(null);
                }}
                onSuccess={() => {
                  setStep('success');
                  onSuccess?.();
                }}
                onError={setError}
              />
            </Elements>
          )}

          {step === 'paypal_redirect' && (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-rose-500 mx-auto" />
              <p className="text-sm text-gray-700 font-medium">
                {t('membership.redirectingPaypal')}
              </p>
              <p className="text-xs text-gray-500">
                {t('membership.paypalConfirmHint', { price: priceLabel })}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StripeCardForm({
  priceLabel,
  onBack,
  onSuccess,
  onError,
}: {
  priceLabel: string;
  onBack: () => void;
  onSuccess: () => void;
  onError: (msg: string | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setLocalError(null);
    onError(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/?stripe=success`,
      },
      redirect: 'if_required',
    });

    setSubmitting(false);

    if (error) {
      const msg = error.message ?? t('membership.paymentRefused');
      setLocalError(msg);
      onError(msg);
      return;
    }

    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm font-semibold text-gray-900">
        {t('membership.cardEntry')}
      </p>
      <div className="rounded-xl border border-gray-200 p-3 bg-white">
        <PaymentElement
          options={{
            layout: 'tabs',
            wallets: { applePay: 'auto', googlePay: 'auto' },
          }}
        />
      </div>

      {(localError) && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{localError}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60"
        >
          {t('common.back')}
        </button>
        <button
          type="submit"
          disabled={!stripe || !elements || submitting}
          className="flex-[1.4] py-3 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('membership.paying')}
            </>
          ) : (
            t('membership.payAmount', { price: priceLabel })
          )}
        </button>
      </div>

      <p className="text-[11px] text-center text-gray-400 leading-relaxed">
        {t('membership.recurringConsent', { price: priceLabel })}
      </p>
    </form>
  );
}

function PaymentOption({
  selected,
  onSelect,
  title,
  subtitle,
  icon,
  disabled,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center gap-3 disabled:opacity-55 disabled:cursor-not-allowed ${
        selected
          ? 'border-rose-400 bg-rose-50/60 ring-2 ring-rose-100'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <span
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          selected ? 'bg-white text-rose-600' : 'bg-gray-50 text-gray-600'
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          {badge && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
              {badge}
            </span>
          )}
        </span>
        <span className="block text-xs text-gray-500 mt-0.5">{subtitle}</span>
      </span>
      <span
        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
          selected
            ? 'border-rose-500 bg-rose-500 shadow-[inset_0_0_0_2px_white]'
            : 'border-gray-300'
        }`}
      />
    </button>
  );
}

function PayPalMark() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <path
        fill="#003087"
        d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.77.77 0 0 1 .76-.653h6.918c2.28 0 3.94.55 4.94 1.64.93 1.01 1.25 2.39.95 4.1-.03.16-.06.32-.1.48-.72 3.48-3.1 5.24-7.06 5.24H8.64a.77.77 0 0 0-.76.653l-.99 5.93a.64.64 0 0 1-.632.527z"
      />
      <path
        fill="#009CDE"
        d="M19.572 7.12c-.03.17-.07.34-.11.51-.8 3.84-3.35 5.78-7.52 5.78h-1.9a.77.77 0 0 0-.76.65l-1.15 6.9a.64.64 0 0 0 .633.74h3.98a.54.54 0 0 0 .534-.45l.04-.2.83-5.26.054-.29a.54.54 0 0 1 .533-.45h.336c3.34 0 5.95-1.36 6.72-5.28.32-1.64.15-3.01-.76-3.98-.26-.28-.58-.5-.95-.67.28.84.32 1.74.08 2.75z"
      />
    </svg>
  );
}
