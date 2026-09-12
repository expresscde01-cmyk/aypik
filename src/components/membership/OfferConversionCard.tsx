import { useState } from 'react';
import { Check } from 'lucide-react';
import { SITE_FREE_MODE } from '@/lib/founderCopy';
import { type MembershipStatus } from '@/lib/membership';
import { PaymentCheckoutModal } from '@/components/membership/PaymentCheckoutModal';
import { LegalLink } from '@/components/LegalTerms';
import {
  offerCardDomId,
  type HighlightOffer,
} from '@/lib/conversionNav';
import { useTranslation } from 'react-i18next';

const COMING_SOON_OFFERS: HighlightOffer[] = [
  'international',
  'visibility',
  'francophone',
];

const OFFER_COPY = {
  simplifie: {
    titleKey: 'membership.offerSimplifiedTitle',
    descKey: 'membership.offerSimplifiedDesc',
  },
  detaille: {
    titleKey: 'membership.offerDetailedTitle',
    descKey: 'membership.offerDetailedDesc',
  },
  international: {
    titleKey: 'membership.offerInternationalTitle',
    descKey: 'membership.offerInternationalDesc',
  },
  visibility: {
    titleKey: 'membership.offerVisibilityTitle',
    descKey: 'membership.offerVisibilityDesc',
  },
  francophone: {
    titleKey: 'membership.offerFrancophoneTitle',
    descKey: 'membership.offerFrancophoneDesc',
  },
} as const;

export function OfferConversionCard({
  offer,
  status,
  highlighted = false,
  onPaymentSuccess,
}: {
  offer: Exclude<HighlightOffer, 'premium'>;
  status: MembershipStatus;
  highlighted?: boolean;
  onPaymentSuccess?: () => void;
}) {
  const { t } = useTranslation();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  if (SITE_FREE_MODE) return null;

  const comingSoon = COMING_SOON_OFFERS.includes(offer);
  const paymentReady = status.payment_visible && !comingSoon;
  const copy = OFFER_COPY[offer];
  const locked = comingSoon || !status.payment_visible;

  return (
    <>
      <div
        id={offerCardDomId(offer)}
        aria-disabled={locked || undefined}
        className={
          locked
            ? `rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden opacity-55 grayscale select-none${
                highlighted ? ' ring-2 ring-rose-400 ring-offset-2' : ''
              }`
            : `rounded-2xl border border-rose-200 bg-white overflow-hidden shadow-sm shadow-rose-50${
                highlighted ? ' ring-2 ring-rose-400 ring-offset-2' : ''
              }`
        }
      >
        <div
          className={
            locked
              ? 'bg-gray-100 px-4 py-3 border-b border-gray-200'
              : 'bg-gradient-to-r from-rose-500 to-amber-500 px-4 py-3 text-white'
          }
        >
          <p
            className={
              locked
                ? 'text-xs font-medium text-gray-500'
                : 'text-xs font-medium text-white/90'
            }
          >
            {t('membership.offers')}
          </p>
          <p
            className={
              locked
                ? 'text-lg font-bold tracking-tight text-gray-800 mt-0.5'
                : 'text-lg font-bold tracking-tight mt-0.5'
            }
          >
            {t(copy.titleKey)}
          </p>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-600 leading-relaxed">
            {t(copy.descKey)}
          </p>

          {comingSoon ? (
            <p className="text-xs font-medium text-gray-700 leading-relaxed bg-white/70 border border-gray-200 rounded-xl px-3 py-2">
              {t('membership.comingSoon')}
            </p>
          ) : !status.payment_visible ? (
            <p className="text-xs font-medium text-gray-700 leading-relaxed bg-white/70 border border-gray-200 rounded-xl px-3 py-2">
              {t('membership.lockedNeedOffer')}
            </p>
          ) : (
            <ul className="space-y-1.5">
              <li className="flex items-center gap-2 text-xs text-gray-600">
                <Check className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                {t('membership.withoutCommitment')}
              </li>
            </ul>
          )}

          {paymentReady ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setCheckoutOpen(true)}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white text-sm font-semibold hover:opacity-95 transition-opacity"
              >
                {t('membership.chooseOffer')}
              </button>
              <p className="text-[10px] text-center text-gray-400 leading-relaxed">
                {t('membership.securePaymentLegal')}{' '}
                <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors">
                  {t('common.legalCguCgv')}
                </LegalLink>
              </p>
            </div>
          ) : (
            <div
              role="presentation"
              aria-hidden="true"
              className="w-full py-2.5 rounded-xl border border-gray-200 bg-gray-100 text-gray-400 text-sm font-semibold text-center cursor-not-allowed"
            >
              {comingSoon
                ? t('membership.comingSoon')
                : t('membership.chooseOffer')}
            </div>
          )}
        </div>
      </div>

      {paymentReady && checkoutOpen && (
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
