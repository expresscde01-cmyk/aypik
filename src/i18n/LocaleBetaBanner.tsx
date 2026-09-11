import { useTranslation } from 'react-i18next';
import { isPlaceholderLocale, isSupportedLocale } from '@/i18n/locales';

export default function LocaleBetaBanner() {
  const { t, i18n } = useTranslation();
  const code = (i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0];
  if (!isSupportedLocale(code) || !isPlaceholderLocale(code)) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-100 bg-amber-50/95 text-amber-900"
    >
      <p className="mx-auto max-w-3xl px-4 py-2 text-center text-[13px] font-medium leading-snug">
        {t('common.localeBetaBanner')}
      </p>
    </div>
  );
}
