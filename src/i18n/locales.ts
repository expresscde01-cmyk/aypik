export const SUPPORTED_LOCALES = ['fr', 'en', 'es'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'fr';

export const LOCALE_STORAGE_KEY = 'aypik.locale';

/**
 * Placeholder = traduction non finalisée.
 * Passer à `false` langue par langue après la trad pro :
 * bandeau, noindex et hreflang se réalignent tout seuls.
 * Garder le miroir PHP dans `public/index.php` ($localePlaceholder).
 */
export const LOCALE_PLACEHOLDER: Record<AppLocale, boolean> = {
  fr: false,
  en: false,
  es: false,
};

export const LOCALE_TO_BCP47: Record<AppLocale, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  es: 'es-ES',
};

export const LOCALE_TO_OG: Record<AppLocale, string> = {
  fr: 'fr_FR',
  en: 'en_GB',
  es: 'es_ES',
};

export function isSupportedLocale(value: unknown): value is AppLocale {
  return value === 'fr' || value === 'en' || value === 'es';
}

export function isPlaceholderLocale(locale: AppLocale): boolean {
  return LOCALE_PLACEHOLDER[locale];
}

export function indexableLocales(): AppLocale[] {
  return SUPPORTED_LOCALES.filter((locale) => !isPlaceholderLocale(locale));
}

export function localeFromNavigator(
  languages: readonly string[] | undefined
): AppLocale | null {
  for (const raw of languages ?? []) {
    const code = raw.trim().toLowerCase().split('-')[0];
    if (isSupportedLocale(code) && !isPlaceholderLocale(code)) return code;
  }
  return null;
}
