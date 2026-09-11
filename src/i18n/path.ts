import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  type AppLocale,
} from '@/i18n/locales';

export function normalizeRestPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Découpe `/en/contact` → locale `en`, reste `/contact`. `/fr` est un préfixe (à canoniser). */
export function stripLocalePrefix(pathname: string): {
  locale: AppLocale;
  rest: string;
  hadPrefix: boolean;
  prefix: AppLocale | null;
} {
  const parts = (pathname || '/').split('/').filter(Boolean);
  const first = parts[0]?.toLowerCase();
  if (isSupportedLocale(first)) {
    const restParts = parts.slice(1);
    const rest = restParts.length === 0 ? '/' : `/${restParts.join('/')}`;
    return {
      locale: first,
      rest: normalizeRestPath(rest),
      hadPrefix: true,
      prefix: first,
    };
  }
  return {
    locale: DEFAULT_LOCALE,
    rest: normalizeRestPath(pathname || '/'),
    hadPrefix: false,
    prefix: null,
  };
}

export function withLocalePrefix(
  locale: AppLocale,
  rest: string,
  search = '',
  hash = ''
): string {
  const path = normalizeRestPath(rest);
  const prefixed =
    locale === DEFAULT_LOCALE
      ? path
      : path === '/'
        ? `/${locale}/`
        : `/${locale}${path}`;
  return prefixed + search + hash;
}

export function localizedHref(
  locale: AppLocale,
  rest: string,
  search?: string,
  hash?: string
): string {
  const url = new URL(window.location.href);
  return withLocalePrefix(
    locale,
    rest,
    search ?? url.search,
    hash ?? url.hash
  );
}

export function rewriteLocationToLocale(locale: AppLocale): void {
  const { rest, prefix } = stripLocalePrefix(window.location.pathname);
  if (prefix === 'fr' || prefix !== locale) {
    const next = withLocalePrefix(
      locale,
      rest,
      window.location.search,
      window.location.hash
    );
    const current =
      window.location.pathname + window.location.search + window.location.hash;
    if (next !== current) {
      window.history.replaceState({}, '', next);
    }
  }
}

export function isLocalizedContactPath(pathname = window.location.pathname): boolean {
  return stripLocalePrefix(pathname).rest === '/contact';
}
