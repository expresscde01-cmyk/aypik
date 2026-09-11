import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { applyLocale } from '@/i18n/applyLocale';

export default function LegalTranslationBanner({
  variant,
}: {
  variant: 'sticky' | 'end';
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const sticky = variant === 'sticky';

  return (
    <aside
      role="note"
      aria-label={t('legal.officialNoticeTitle')}
      className={
        sticky
          ? 'sticky top-14 z-10 border-b-2 border-amber-600 bg-amber-100 shadow-md'
          : 'mt-6 rounded-2xl border-2 border-amber-600 bg-amber-100 shadow-md'
      }
    >
      <div
        className={`flex gap-3 items-start py-3.5 ${
          sticky ? 'max-w-2xl mx-auto px-4' : 'px-4'
        }`}
      >
        <AlertTriangle
          className="w-6 h-6 shrink-0 text-amber-700 mt-0.5"
          aria-hidden
        />
        <div className="space-y-1.5 min-w-0">
          <p className="text-sm font-extrabold uppercase tracking-wide text-amber-950">
            {t('legal.officialNoticeTitle')}
          </p>
          <p className="text-sm font-medium text-amber-950 leading-snug">
            {t('legal.officialNotice')}
          </p>
          <button
            type="button"
            className="text-sm font-bold text-amber-950 underline underline-offset-2 hover:text-rose-700"
            onClick={() => {
              void applyLocale('fr', {
                userId: user?.id,
                persistProfile: Boolean(user?.id),
              });
            }}
          >
            {t('legal.readOfficialFrench')}
          </button>
        </div>
      </div>
    </aside>
  );
}
