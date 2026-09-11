import i18n from './config';
import { LOCALE_TO_BCP47, isSupportedLocale, type AppLocale } from './locales.ts';

export function dateLocale(lang?: string): string {
  const code = (lang || i18n.language || 'fr').split('-')[0];
  const locale: AppLocale = isSupportedLocale(code) ? code : 'fr';
  return LOCALE_TO_BCP47[locale];
}

export function formatDateLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(dateLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateWeekdayLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(dateLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function widgetLanguage(): AppLocale {
  const lng = (i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0];
  return isSupportedLocale(lng) ? lng : 'fr';
}
