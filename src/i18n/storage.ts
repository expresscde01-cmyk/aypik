import {
  isSupportedLocale,
  LOCALE_STORAGE_KEY,
  type AppLocale,
} from '@/i18n/locales';

export function readStoredLocale(): AppLocale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isSupportedLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: AppLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* private mode */
  }
}
