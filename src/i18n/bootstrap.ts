import i18n from '@/i18n/config';
import { syncDocumentMeta } from '@/i18n/documentMeta';
import {
  DEFAULT_LOCALE,
  localeFromNavigator,
  type AppLocale,
} from '@/i18n/locales';
import { rewriteLocationToLocale, stripLocalePrefix } from '@/i18n/path';
import { readStoredLocale, writeStoredLocale } from '@/i18n/storage';

function isLikelyCrawler(): boolean {
  const ua = navigator.userAgent || '';
  return /googlebot|bingbot|yandex|baiduspider|duckduckbot|slurp|facebookexternalhit|twitterbot/i.test(
    ua
  );
}

export function resolveBootLocale(): AppLocale {
  const { prefix, hadPrefix } = stripLocalePrefix(window.location.pathname);
  if (hadPrefix && prefix && prefix !== 'fr') return prefix;

  const stored = readStoredLocale();
  if (stored) return stored;

  // Locales placeholder : pas de bascule auto via le navigateur.
  if (!isLikelyCrawler()) {
    const nav = localeFromNavigator(navigator.languages ?? [navigator.language]);
    if (nav) return nav;
  }

  return DEFAULT_LOCALE;
}

export function bootstrapLocale(): AppLocale {
  const locale = resolveBootLocale();
  void i18n.changeLanguage(locale);
  writeStoredLocale(locale);
  rewriteLocationToLocale(locale);
  syncDocumentMeta(locale);
  return locale;
}
