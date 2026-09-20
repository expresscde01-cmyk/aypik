import { useMemo, type Ref } from 'react';
import { AlertCircle } from 'lucide-react';
import { useMembership } from '@/lib/useMembership';
import { useTranslation } from 'react-i18next';
import { isNativeLanguageRequired } from '@/lib/isNativeLanguageRequired';
import {
  MAX_SPOKEN_LANGUAGES,
  hasNativeSpokenLanguage,
  parseSpokenLanguages,
  type SpokenDraft,
  type SpokenLanguage,
} from '@/lib/spokenLanguages';
import SpokenLanguagePicker from '@/components/SpokenLanguagePicker';

export default function SpokenLanguagesProfileCard({
  countryCode,
  drafts,
  onChange,
  persistedLanguages,
  error,
  cardRef,
}: {
  countryCode?: string | null;
  drafts: SpokenDraft[];
  onChange: (next: SpokenDraft[]) => void;
  persistedLanguages?: SpokenLanguage[] | null;
  error?: string | null;
  cardRef?: Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation();
  const { status } = useMembership();

  const required = isNativeLanguageRequired(
    { country_code: countryCode },
    status
  );
  const showReminder = useMemo(
    () =>
      required &&
      !hasNativeSpokenLanguage(parseSpokenLanguages(persistedLanguages)),
    [required, persistedLanguages]
  );

  return (
    <div
      ref={cardRef}
      className="mt-6 bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-6 sm:p-8"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900">
          {t('languages.title')}
          {required && (
            <span className="ml-2 text-xs font-semibold text-rose-600">
              {t('languages.required')}
            </span>
          )}
        </h2>
        <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full whitespace-nowrap">
          {drafts.length} / {MAX_SPOKEN_LANGUAGES}
        </span>
      </div>
      <p className="text-sm text-gray-500 mt-1">{t('languages.profileHelp')}</p>
      {showReminder && (
        <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          {t('languages.existingReminder')}
        </p>
      )}
      <div className="mt-4">
        <SpokenLanguagePicker
          drafts={drafts}
          onChange={onChange}
          nativeRequired={required}
        />
      </div>
      {error && (
        <div className="mt-5 flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
