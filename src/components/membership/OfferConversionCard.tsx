import { useState } from 'react';
import { Check } from 'lucide-react';
import { SITE_FREE_MODE } from '@/lib/founderCopy';
import { formatPriceCents, internationalAddonPriceCents, type MembershipStatus } from '@/lib/membership';
import { canBuyAddons } from '@/lib/offerAccess';
import { PaymentCheckoutModal } from '@/components/membership/PaymentCheckoutModal';
import { LegalLink } from '@/components/LegalTerms';
import { offerCardDomId, type HighlightOffer } from '@/lib/conversionNav';
import { useTranslation } from 'react-i18next';

/** Options à la carte gérées par cette carte générique (les paliers passent par PremiumConversionCard). */
export type AddonHighlightOffer = 'visibility' | 'francophone' | 'international';

const OFFER_COPY = {
  visibility: {
    titleKey: 'membership.offerVisibilityTitle',
    descKey: 'membership.offerVisibilityDesc',
    priceField: 'visibilite_price_cents',
    plan: 'visibilite',
    benefitKey: 'membership.benefitVisibilite',
  },
  francophone: {
    titleKey: 'membership.offerFrancophoneTitle',
    descKey: 'membership.offerFrancophoneDesc',
    priceField: 'francophone_price_cents',
    plan: 'francophone',
    benefitKey: 'membership.benefitFrancophone',
  },
  international: {
    titleKey: 'membership.offerInternationalTitle',
    descKey: 'membership.offerInternationalDesc',
    priceField: 'international_price_cents',
    plan: 'international',
    benefitKey: 'membership.benefitInternational',
  },
} as const;

export function OfferConversionCard({
  offer,
  status,
  highlighted = false,
  onPaymentSuccess,
}: {
  offer: AddonHighlightOffer;
  status: MembershipStatus;
  highlighted?: boolean;
  onPaymentSuccess?: () => void;
}) {
  const { t } = useTranslation();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  if (SITE_FREE_MODE) return null;

  const copy = OFFER_COPY[offer];
  const included =
    offer === 'visibility'
      ? status.plan === 'premium' || Boolean(status.visibilite_until)
      : offer === 'francophone'
        ? status.plan === 'confort' ||
          status.plan === 'premium' ||
          Boolean(status.international_until) ||
          Boolean(status.francophone_until)
        : status.plan === 'premium' || Boolean(status.international_until);
  const priceCents = status[copy.priceField] as number;
  const amount = formatPriceCents(priceCents, status.premium_currency);
  const addonsAllowed = canBuyAddons(status);
  const paymentReady = addonsAllowed && status.payment_visible && !included;

  return (
    <>
      <div
        id={offerCardDomId(offer as HighlightOffer)}
        aria-disabled={included || undefined}
        className={
          (included
            ? 'rounded-2xl border border-emerald-200 bg-emerald-50/40 overflow-hidden'
            : 'rounded-2xl border border-gray-200 bg-white overflow-hidden') +
          (highlighted ? ' ring-2 ring-rose-400 ring-offset-2' : '')
        }
      >
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-bold tracking-tight text-gray-800">
              {t(copy.titleKey)}
            </p>
            {!included && (
              <p className="text-sm font-bold text-gray-800 whitespace-nowrap">
                {amount}
                <span className="text-xs font-medium text-gray-500">
                  {' '}
                  {t('membership.perMonth')}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-600 leading-relaxed">
            {t(copy.descKey)}
          </p>

          <ul className="space-y-1.5">
            <li className="flex items-center gap-2 text-xs text-gray-600">
              <Check className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
              {t(copy.benefitKey)}
            </li>
          </ul>

          {included ? (
            <p className="text-xs font-medium text-emerald-800 leading-relaxed bg-white/70 border border-emerald-200 rounded-xl px-3 py-2">
              {t('membership.includedInOffer', {
                offer: t('common.offer.shortPremium'),
              })}
            </p>
          ) : !addonsAllowed ? (
            <p className="text-xs font-medium text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              {t('membership.lockedNeedEssentiel')}
            </p>
          ) : !status.payment_visible ? (
            <p className="text-xs font-medium text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              {t('membership.lockedNeedOffer')}
            </p>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setCheckoutOpen(true)}
                className="w-full py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
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
          )}
        </div>
      </div>

      {paymentReady && checkoutOpen && (
        <PaymentCheckoutModal
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          status={status}
          onSuccess={onPaymentSuccess}
          plan={copy.plan}
        />
      )}
    </>
  );
}

type GeoReachPalier = 'francophone' | 'international';

/** Un seul curseur à deux paliers exclusifs (jamais deux cases cumulables). */
export function GeoReachAddonCard({
  status,
  highlighted = false,
  onPaymentSuccess,
}: {
  status: MembershipStatus;
  highlighted?: boolean;
  onPaymentSuccess?: () => void;
}) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<GeoReachPalier>(
    status.plan === 'confort' ? 'international' : 'francophone'
  );
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  if (SITE_FREE_MODE) return null;

  const francophoneIncluded =
    status.plan === 'confort' ||
    status.plan === 'premium' ||
    Boolean(status.international_until) ||
    Boolean(status.francophone_until);
  const internationalIncluded =
    status.plan === 'premium' || Boolean(status.international_until);
  const addonsAllowed = canBuyAddons(status);
  const selectedIncluded =
    choice === 'international' ? internationalIncluded : francophoneIncluded;
  const paymentReady =
    addonsAllowed && status.payment_visible && !selectedIncluded;
  const francoAmount = formatPriceCents(
    status.francophone_price_cents,
    status.premium_currency
  );
  const intlAmount = formatPriceCents(
    internationalAddonPriceCents(status) || status.international_price_cents,
    status.premium_currency
  );

  return (
    <>
      <div
        id={offerCardDomId('francophone')}
        className={
          (internationalIncluded
            ? 'rounded-2xl border border-emerald-200 bg-emerald-50/40 overflow-hidden'
            : 'rounded-2xl border border-gray-200 bg-white overflow-hidden') +
          (highlighted ? ' ring-2 ring-rose-400 ring-offset-2' : '')
        }
      >
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
          <p className="text-sm font-bold tracking-tight text-gray-800">
            {t('membership.geoReachTitle')}
          </p>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-600 leading-relaxed">
            {t('membership.geoReachDesc')}
          </p>
          <fieldset className="space-y-2" disabled={!addonsAllowed}>
            <legend className="sr-only">{t('membership.geoReachTitle')}</legend>
            <label
              id={offerCardDomId('international')}
              className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-xs ${
                choice === 'francophone'
                  ? 'border-rose-300 bg-rose-50/50'
                  : 'border-gray-200'
              } ${francophoneIncluded ? 'opacity-80' : ''}`}
            >
              <input
                type="radio"
                name="geo-reach"
                className="mt-0.5"
                checked={choice === 'francophone'}
                disabled={internationalIncluded}
                onChange={() => setChoice('francophone')}
              />
              <span className="flex-1">
                <span className="font-semibold text-gray-800">
                  {t('common.offer.shortFrancophone')}
                </span>
                <span className="block text-gray-500 mt-0.5">
                  {francophoneIncluded
                    ? t('offersGrid.included')
                    : `${francoAmount} ${t('membership.perMonth')}`}
                </span>
              </span>
            </label>
            <label
              className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-xs ${
                choice === 'international'
                  ? 'border-rose-300 bg-rose-50/50'
                  : 'border-gray-200'
              }`}
            >
              <input
                type="radio"
                name="geo-reach"
                className="mt-0.5"
                checked={choice === 'international'}
                onChange={() => setChoice('international')}
              />
              <span className="flex-1">
                <span className="font-semibold text-gray-800">
                  {t('common.offer.shortInternational')}
                </span>
                <span className="block text-gray-500 mt-0.5">
                  {internationalIncluded
                    ? t('offersGrid.included')
                    : `${intlAmount} ${t('membership.perMonth')}`}
                </span>
              </span>
            </label>
          </fieldset>

          {internationalIncluded ? (
            <p className="text-xs font-medium text-emerald-800 leading-relaxed bg-white/70 border border-emerald-200 rounded-xl px-3 py-2">
              {t('membership.includedInOffer', {
                offer: t('common.offer.shortPremium'),
              })}
            </p>
          ) : !addonsAllowed ? (
            <p className="text-xs font-medium text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              {t('membership.lockedNeedEssentiel')}
            </p>
          ) : !status.payment_visible ? (
            <p className="text-xs font-medium text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              {t('membership.lockedNeedOffer')}
            </p>
          ) : selectedIncluded ? (
            <p className="text-xs font-medium text-emerald-800 leading-relaxed bg-white/70 border border-emerald-200 rounded-xl px-3 py-2">
              {t('offersGrid.included')}
            </p>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setCheckoutOpen(true)}
                className="w-full py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
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
          )}
        </div>
      </div>

      {paymentReady && checkoutOpen && (
        <PaymentCheckoutModal
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          status={status}
          onSuccess={onPaymentSuccess}
          plan={choice}
        />
      )}
    </>
  );
}
