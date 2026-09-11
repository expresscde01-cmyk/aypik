import i18n from '@/i18n/config';
import {
  DEFAULT_LOCALE,
  indexableLocales,
  isPlaceholderLocale,
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

function syncRobotsMeta(locale: AppLocale): void {
  const existing = document.querySelector('meta[data-aypik-robots]');
  if (isPlaceholderLocale(locale)) {
    const el =
      existing ??
      (() => {
        const meta = document.createElement('meta');
        meta.setAttribute('name', 'robots');
        meta.setAttribute('data-aypik-robots', '1');
        document.head.appendChild(meta);
        return meta;
      })();
    el.setAttribute('content', 'noindex, follow');
    return;
  }
  existing?.remove();
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
  syncRobotsMeta(locale);

  const { rest } = stripLocalePrefix(window.location.pathname);
  const existing = document.querySelectorAll('link[data-aypik-hreflang]');
  existing.forEach((n) => n.remove());
  const head = document.head;
  const defaultHref = hreflangHref(DEFAULT_LOCALE, rest);
  const tags: Array<{ lang: string; href: string }> = [
    ...indexableLocales().map((lang) => ({
      lang,
      href: hreflangHref(lang, rest),
    })),
    { lang: 'x-default', href: defaultHref },
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
