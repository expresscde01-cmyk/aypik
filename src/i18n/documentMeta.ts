import i18n from '@/i18n/config';
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  LOCALE_TO_OG,
  type AppLocale,
} from '@/i18n/locales';
import { stripLocalePrefix, withLocalePrefix } from '@/i18n/path';

function setMeta(selector: string, content: string, attr = 'content') {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, content);
}

function origin(): string {
  return window.location.origin.replace(/\/$/, '');
}

function hreflangHref(locale: AppLocale, rest: string): string {
  const path = withLocalePrefix(locale, rest);
  return `${origin()}${path === '/' ? '/' : path}`;
}

export function syncDocumentMeta(locale: AppLocale = currentLocale()): void {
  document.documentElement.lang = locale;
  const title = i18n.t('seo.title');
  document.title = title;
  setMeta('meta[name="description"]', i18n.t('seo.metaDescription'));
  setMeta('meta[property="og:title"]', i18n.t('seo.ogTitle'));
  setMeta('meta[property="og:description"]', i18n.t('seo.ogDescription'));
  setMeta('meta[property="og:locale"]', LOCALE_TO_OG[locale]);
  setMeta('meta[name="twitter:title"]', i18n.t('seo.twitterTitle'));
  setMeta('meta[name="twitter:description"]', i18n.t('seo.twitterDescription'));
  setMeta('meta[name="application-name"]', i18n.t('seo.applicationName'));

  const { rest } = stripLocalePrefix(window.location.pathname);
  const existing = document.querySelectorAll('link[data-aypik-hreflang]');
  existing.forEach((n) => n.remove());
  const head = document.head;
  const tags: Array<{ lang: string; href: string }> = [
    { lang: 'fr', href: hreflangHref('fr', rest) },
    { lang: 'en', href: hreflangHref('en', rest) },
    { lang: 'es', href: hreflangHref('es', rest) },
    { lang: 'x-default', href: hreflangHref('fr', rest) },
  ];
  for (const tag of tags) {
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = tag.lang;
    link.href = tag.href;
    link.setAttribute('data-aypik-hreflang', '1');
    head.appendChild(link);
  }
}

export function currentLocale(): AppLocale {
  const lng = i18n.resolvedLanguage || i18n.language || DEFAULT_LOCALE;
  const base = lng.split('-')[0];
  return isSupportedLocale(base) ? base : DEFAULT_LOCALE;
}
