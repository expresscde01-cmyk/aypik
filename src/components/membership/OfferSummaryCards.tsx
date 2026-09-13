import { useState } from 'react';
import { Check } from 'lucide-react';
import { SITE_FREE_MODE } from '@/lib/founderCopy';
import { OffersComparisonTable } from '@/components/membership/OffersComparisonTable';
import { PaymentCheckoutModal } from '@/components/membership/PaymentCheckoutModal';
import { formatPriceCents, type MembershipStatus } from '@/lib/membership';
import type { PaymentPlanTier } from '@/lib/payments';
import { useTranslation } from 'react-i18next';

type SummaryId = 'gratuit' | 'basique' | 'essentiel' | 'confort' | 'premium';

const TITLE_KEY = {
  gratuit: 'common.offer.shortGratuit',
  basique: 'common.offer.shortBasique',
  essentiel: 'common.offer.shortEssentiel',
  confort: 'common.offer.shortConfort',
  premium: 'common.offer.shortPremium',
} as const;

const FALLBACK_PRICE_KEY = {
  basique: 'offersGrid.priceBasique',
  essentiel: 'offersGrid.priceEssentiel',
  confort: 'offersGrid.priceConfort',
  premium: 'offersGrid.pricePremium',
} as const;

/** Vue d’entrée §1 bis : 5 cartes, tableau détaillé derrière « Comparer ». */
export function OfferSummaryCards({
  status,
  onChooseFree,
  onRefresh,
  highlighted,
}: {
  status?: MembershipStatus;
  onChooseFree?: () => void;
  onRefresh?: () => void;
  highlighted?: SummaryId | null;
}) {
  const { t } = useTranslation();
  const [compareOpen, setCompareOpen] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<PaymentPlanTier | null>(null);
  if (SITE_FREE_MODE) return null;

  const cards: {
    id: SummaryId;
    hook: string;
    points: readonly [string, string, string];
    cta: string;
  }[] = [
    {
      id: 'gratuit',
      hook: t('offersCards.gratuitHook'),
      points: [
        t('offersCards.gratuitP1'),
        t('offersCards.gratuitP2'),
        t('offersCards.gratuitP3'),
      ],
      cta: t('offersCards.gratuitCta'),
    },
    {
      id: 'basique',
      hook: t('offersCards.basiqueHook'),
      points: [
        t('offersCards.basiqueP1'),
        t('offersCards.basiqueP2'),
        t('offersCards.basiqueP3'),
      ],
      cta: t('offersCards.basiqueCta'),
    },
    {
      id: 'essentiel',
      hook: t('offersCards.essentielHook'),
      points: [
        t('offersCards.essentielP1'),
        t('offersCards.essentielP2'),
        t('offersCards.essentielP3'),
      ],
      cta: t('offersCards.essentielCta'),
    },
    {
      id: 'confort',
      hook: t('offersCards.confortHook'),
      points: [
        t('offersCards.confortP1'),
        t('offersCards.confortP2'),
        t('offersCards.confortP3'),
      ],
      cta: t('offersCards.confortCta'),
    },
    {
      id: 'premium',
      hook: t('offersCards.premiumHook'),
      points: [
        t('offersCards.premiumP1'),
        t('offersCards.premiumP2'),
        t('offersCards.premiumP3'),
      ],
      cta: t('offersCards.premiumCta'),
    },
  ];

  const amountFor = (id: SummaryId): { amount: string; perMonth: boolean } => {
    if (id === 'gratuit') {
      return { amount: t('offersGrid.priceFree'), perMonth: false };
    }
    if (!status) {
      return { amount: t(FALLBACK_PRICE_KEY[id]), perMonth: false };
    }
    const cents =
      id === 'basique'
        ? status.basique_price_cents
        : id === 'essentiel'
          ? status.essentiel_price_cents
          : id === 'confort'
            ? status.confort_price_cents
            : status.premium_price_cents;
    return {
      amount: formatPriceCents(cents, status.premium_currency),
      perMonth: true,
    };
  };

  const choose = (id: SummaryId) => {
    if (id === 'gratuit') {
      onChooseFree?.();
      return;
    }
    if (status) {
      setCheckoutPlan(id);
      return;
    }
    onChooseFree?.();
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const { amount, perMonth } = amountFor(card.id);
          return (
            <article
              key={card.id}
              className={
                'rounded-2xl border border-gray-200 bg-white overflow-hidden flex flex-col' +
                (highlighted === card.id
                  ? ' ring-2 ring-rose-400 ring-offset-2'
                  : '')
              }
            >
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <p className="text-sm font-bold tracking-tight text-gray-900">
                  {t(TITLE_KEY[card.id])}
                </p>
                <p className="mt-0.5 text-lg font-extrabold text-gray-800">
                  {amount}
                  {perMonth ? (
                    <span className="ml-1 text-xs font-medium text-gray-500">
                      {t('membership.perMonth')}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs font-medium text-rose-600">
                  {card.hook}
                </p>
              </div>
              <div className="p-4 flex-1 flex flex-col gap-3">
                <ul className="space-y-1.5">
                  {card.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2 text-xs text-gray-700 leading-snug"
                    >
                      <Check className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                      {point}
                    </li>
                  ))}
                </ul>
                {(card.id !== 'gratuit' || onChooseFree) && (
                  <button
                    type="button"
                    onClick={() => choose(card.id)}
                    className="mt-auto w-full py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
                  >
                    {card.cta}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p className="text-[11px] leading-snug text-gray-500 px-0.5">
        {t('offersCards.confortNote')}
      </p>
      <div className="text-center">
        <button
          type="button"
          aria-expanded={compareOpen}
          onClick={() => setCompareOpen((open) => !open)}
          className="text-sm font-semibold text-rose-600 underline underline-offset-2 hover:text-rose-700"
        >
          {compareOpen
            ? t('offersCards.hideCompare')
            : t('offersCards.showCompare')}
        </button>
      </div>
      {compareOpen ? <OffersComparisonTable /> : null}
      {status && checkoutPlan && (
        <PaymentCheckoutModal
          open
          onClose={() => setCheckoutPlan(null)}
          status={status}
          onSuccess={onRefresh}
          plan={checkoutPlan}
        />
      )}
    </div>
  );
}
