import type { CSSProperties } from 'react';
import { SITE_FREE_MODE } from '@/lib/founderCopy';
import { formatPriceCents, founderPriceCents } from '@/lib/membership';
import { LegalLink } from '@/components/LegalChrome';
import { useTranslation } from 'react-i18next';

const HEADERS = [
  'offersGrid.feature',
  'common.offer.shortGratuit',
  'common.offer.shortBasique',
  'common.offer.shortEssentiel',
  'common.offer.shortConfort',
  'common.offer.shortPremium',
] as const;

const TOP_ROWS = [
  [
    'offersGrid.price',
    'offersGrid.priceFree',
    'offersGrid.priceBasique',
    'offersGrid.priceEssentiel',
    'offersGrid.priceConfort',
    'offersGrid.pricePremium',
  ],
  [
    'offersGrid.messaging',
    'offersGrid.msgFree',
    'offersGrid.included',
    'offersGrid.included',
    'offersGrid.included',
    'offersGrid.included',
  ],
  [
    'offersGrid.openProfile',
    'offersGrid.included',
    'offersGrid.included',
    'offersGrid.included',
    'offersGrid.openProtected',
    'offersGrid.openProtected',
  ],
  [
    'offersGrid.whoLiked',
    'offersGrid.no',
    'offersGrid.no',
    'offersGrid.no',
    'offersGrid.included',
    'offersGrid.included',
  ],
  [
    'offersGrid.interests',
    'offersGrid.indifferentFixed',
    'offersGrid.indifferentFixed',
    'offersGrid.included',
    'offersGrid.included',
    'offersGrid.included',
  ],
] as const;

const GEO_ROWS = [
  [
    'offersGrid.geoNeighbors',
    'offersGrid.included',
    'offersGrid.included',
    'offersGrid.included',
    'offersGrid.included',
    'offersGrid.included',
  ],
  [
    'offersGrid.geoNational',
    'offersGrid.no',
    'offersGrid.included',
    'offersGrid.included',
    'offersGrid.included',
    'offersGrid.included',
  ],
  [
    'offersGrid.geoFrancophone',
    'offersGrid.no',
    'offersGrid.no',
    'offersGrid.priceAddon',
    'offersGrid.included',
    'offersGrid.included',
  ],
  [
    'offersGrid.geoInternational',
    'offersGrid.no',
    'offersGrid.no',
    'offersGrid.priceIntlFull',
    'offersGrid.priceIntlUpgrade',
    'offersGrid.included',
  ],
] as const;

const BOTTOM_ROWS = [
  [
    'offersGrid.quotas',
    'offersGrid.quotaFree',
    'offersGrid.quotaBasique',
    'offersGrid.quotaEssentiel',
    'offersGrid.unlimited',
    'offersGrid.unlimited',
  ],
  [
    'offersGrid.visibility',
    'offersGrid.no',
    'offersGrid.no',
    'offersGrid.priceAddon',
    'offersGrid.priceAddon',
    'offersGrid.included',
  ],
  [
    'offersGrid.boost',
    'offersGrid.no',
    'offersGrid.no',
    'offersGrid.priceAddon',
    'offersGrid.priceAddon',
    'offersGrid.boostPremium',
  ],
] as const;

const GEO_BOX = '#d1d5db';

type OfferGridKey =
  | (typeof TOP_ROWS)[number][number]
  | (typeof GEO_ROWS)[number][number]
  | (typeof BOTTOM_ROWS)[number][number];

function cellClass(col: number): string {
  const base =
    col === 0
      ? 'px-2.5 py-2 font-medium text-gray-800'
      : 'px-2.5 py-2 text-gray-600';
  const freeCut =
    col === 1
      ? ' border-r-2 border-gray-400 pr-3.5'
      : col === 2
        ? ' pl-3.5'
        : '';
  return base + freeCut;
}

/** Tailwind JIT n’extrait pas les classes dynamiques `border-[${GEO_BOX}]`. */
function geoCellStyle(
  col: number,
  geo: 'first' | 'mid' | 'last'
): CSSProperties {
  const style: CSSProperties = {};
  if (col === 0) style.borderLeft = `1px solid ${GEO_BOX}`;
  if (col === 5) style.borderRight = `1px solid ${GEO_BOX}`;
  if (geo === 'first') {
    style.borderTop = `1px solid ${GEO_BOX}`;
    if (col !== 0) style.verticalAlign = 'bottom';
  }
  if (geo === 'last') style.borderBottom = `1px solid ${GEO_BOX}`;
  return style;
}

/** Grille commerciale v3 — visible hors mode lancement gratuit. */
const GRID_CENTS: Record<string, number> = {
  'offersGrid.priceBasique': 999,
  'offersGrid.priceEssentiel': 1499,
  'offersGrid.priceConfort': 1999,
  'offersGrid.pricePremium': 2499,
  'offersGrid.priceAddon': 299,
  'offersGrid.priceIntlFull': 599,
  'offersGrid.priceIntlUpgrade': 299,
};

export function OffersComparisonTable({ founder = false }: { founder?: boolean }) {
  const { t } = useTranslation();
  if (SITE_FREE_MODE) return null;

  const cellText = (key: string) => {
    const cents = GRID_CENTS[key];
    if (!founder || cents == null) return t(key);
    const charge = founderPriceCents(cents);
    return (
      <>
        <span className="mr-1 text-gray-400 line-through">{t(key)}</span>
        {formatPriceCents(charge, 'EUR')}
      </>
    );
  };

  const renderCells = (
    row: readonly OfferGridKey[],
    geo?: 'first' | 'mid' | 'last'
  ) =>
    row.map((key, i) => (
      <td
        key={key + i}
        className={cellClass(i)}
        style={geo ? geoCellStyle(i, geo) : undefined}
      >
        {i === 0 && geo ? (
          <div className="w-full">
            {geo === 'first' ? (
              <div className="font-bold text-left">
                {t('offersGrid.geoPrefix')}
              </div>
            ) : null}
            <div className="w-full text-right font-medium">{cellText(key)}</div>
          </div>
        ) : key === 'offersGrid.indifferentFixed' ? (
          <span className="whitespace-pre-line">{t(key)}</span>
        ) : (
          cellText(key)
        )}
      </td>
    ));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
      <table className="w-full min-w-[40rem] table-fixed text-left text-xs text-gray-700 border-separate border-spacing-0">
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
        </colgroup>
        <caption className="sr-only">{t('offersGrid.caption')}</caption>
        <thead>
          <tr className="bg-gray-50">
            {HEADERS.map((key, i) => (
              <th
                key={key}
                scope="col"
                className={
                  'px-2.5 py-2 font-semibold text-gray-900 whitespace-nowrap border-b border-gray-200' +
                  (i === 1
                    ? ' border-r-2 border-gray-400 pr-3.5'
                    : i === 2
                      ? ' pl-3.5'
                      : '')
                }
              >
                {t(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TOP_ROWS.map((row) => (
            <tr key={row[0]} className="[&>td]:border-b [&>td]:border-gray-100">
              {renderCells(row)}
            </tr>
          ))}
        </tbody>
        <tbody>
          {GEO_ROWS.map((row, idx) => {
            const geo =
              idx === 0 ? 'first' : idx === GEO_ROWS.length - 1 ? 'last' : 'mid';
            return (
              <tr key={row[0]}>
                {renderCells(row, geo)}
              </tr>
            );
          })}
        </tbody>
        <tbody>
          {BOTTOM_ROWS.map((row, idx) => (
            <tr
              key={row[0]}
              className={
                idx < BOTTOM_ROWS.length - 1
                  ? '[&>td]:border-b [&>td]:border-gray-100'
                  : undefined
              }
            >
              {renderCells(row)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-2.5 pt-2 text-[11px] leading-snug text-gray-500">
        {t('offersGrid.inclusionNote')}
      </p>
      <p className="px-2.5 pt-1 text-[11px] leading-snug text-gray-500">
        {t('offersGrid.founderBoostNote')}
      </p>
      <p className="px-2.5 py-2 text-[11px] leading-snug text-gray-500">
        {t('offersGrid.openProtectedNote')}{' '}
        <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors">
          {t('legal.docLabelPaid')}
        </LegalLink>
        .
      </p>
    </div>
  );
}
