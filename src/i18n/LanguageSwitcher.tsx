import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { applyLocale } from '@/i18n/applyLocale';
import { isSupportedLocale, SUPPORTED_LOCALES, type AppLocale } from '@/i18n/locales';

const LANGUAGE_TITLE_KEYS = {
  fr: 'common.languages.fr',
  en: 'common.languages.en',
  es: 'common.languages.es',
} as const;

export default function LanguageSwitcher({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const code = (i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0];
  const active: AppLocale = isSupportedLocale(code) ? code : 'fr';

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className={`inline-flex items-center rounded-lg border border-rose-100 bg-white/80 p-0.5 ${className}`}
    >
      {SUPPORTED_LOCALES.map((code: AppLocale) => {
        const selected = active === code;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={selected}
            title={t(LANGUAGE_TITLE_KEYS[code])}
            onClick={() => {
              void applyLocale(code, {
                userId: user?.id,
                persistProfile: Boolean(user?.id),
              });
            }}
            className={`rounded-md font-semibold tracking-wide transition-colors ${
              compact
                ? 'px-1.5 py-0.5 text-[10px]'
                : 'px-2 py-1 text-xs'
            } ${
              selected
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-gray-500 hover:text-rose-600 hover:bg-rose-50'
            }`}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
