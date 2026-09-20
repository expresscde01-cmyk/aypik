import { useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useMembership } from '@/lib/useMembership';
import { useTranslation } from 'react-i18next';
import { userErrorMessage } from '@/lib/userError';
import { isNativeLanguageRequired } from '@/lib/isNativeLanguageRequired';
import {
  MAX_SPOKEN_LANGUAGES,
  hasNativeSpokenLanguage,
  sanitizeSpokenLanguages,
  type SpokenDraft,
} from '@/lib/spokenLanguages';
import SpokenLanguagePicker from '@/components/SpokenLanguagePicker';

export default function LanguagesOnboarding({
  countryCode,
  onDone,
}: {
  countryCode?: string | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { status } = useMembership();
  const [drafts, setDrafts] = useState<SpokenDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const required = isNativeLanguageRequired(
    { country_code: countryCode },
    status
  );
  const complete = useMemo(() => sanitizeSpokenLanguages(drafts), [drafts]);
  const canContinue = !required || hasNativeSpokenLanguage(complete);

  const persist = async (langs: SpokenDraft[]) => {
    if (!user) return;
    const saved = sanitizeSpokenLanguages(langs);
    if (required && !hasNativeSpokenLanguage(saved)) {
      setError(t('languages.nativeRequiredSignup'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ languages: saved })
        .eq('id', user.id);
      if (updateError) throw updateError;
      onDone();
    } catch (err) {
      setError(userErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-sm font-semibold text-gray-500 hover:text-gray-800 underline underline-offset-2"
          >
            {t('common.signOut')}
          </button>
        </div>
        <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden mb-2">
          <div className="h-full w-full bg-gradient-to-r from-rose-500 to-amber-500 rounded-full" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mt-4">
          {t('languages.signupTitle')}
        </h1>
        <p className="text-sm text-gray-500 mt-1.5">
          {required ? t('languages.signupHelpRequired') : t('languages.signupHelp')}
        </p>

        <div className="bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-6 sm:p-8 mt-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm text-gray-500">{t('languages.selection')}</p>
            <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full whitespace-nowrap">
              {drafts.length} / {MAX_SPOKEN_LANGUAGES}
            </span>
          </div>
          <SpokenLanguagePicker
            drafts={drafts}
            onChange={setDrafts}
            nativeRequired={required}
          />
          {error && (
            <div className="mt-5 flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4 mt-6">
            <button
              type="button"
              disabled={saving || !canContinue}
              onClick={() => void persist(drafts)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-bold shadow-lg shadow-rose-200 hover:opacity-95 disabled:opacity-60"
            >
              {saving ? t('profile.saving') : t('common.continue')}
            </button>
            {!required && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void persist([])}
                className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-800 disabled:opacity-60"
              >
                {t('languages.later')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
