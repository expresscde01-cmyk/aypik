import { useEffect, useState, type Ref } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useTranslation } from 'react-i18next';
import { userErrorMessage } from '@/lib/userError';

export default function EmailNotificationsProfileCard({
  initialEnabled,
  hinted,
  cardRef,
}: {
  initialEnabled: boolean;
  hinted?: boolean;
  cardRef?: Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ email_notifications_enabled: enabled })
        .eq('id', user.id);
      if (updateError) throw updateError;
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(userErrorMessage(err, t('profile.emailPrefError')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={cardRef}
      id="email-preferences"
      className={`mt-6 bg-white rounded-3xl shadow-xl shadow-rose-100/50 border p-6 sm:p-8 ${
        hinted
          ? 'border-rose-300 ring-2 ring-rose-100'
          : 'border-rose-100'
      }`}
    >
      <h2 className="text-lg font-bold text-gray-900">
        {t('profile.preferences')}
      </h2>
      <p className="text-sm text-gray-500 mt-1">{t('profile.emailPrefsHint')}</p>
      <label className="mt-5 flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setSaved(false);
            setEnabled(e.target.checked);
          }}
          className="mt-1 rounded border-gray-300 text-rose-500 focus:ring-rose-400"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-800">
            {t('profile.emailNotifications')}
          </span>
          <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
            {t('profile.emailPrefsLegal')}
          </span>
        </span>
      </label>
      {error && (
        <div className="mt-5 flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <div className="mt-6 space-y-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200 hover:shadow-rose-300 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? t('profile.saving') : t('languages.save')}
        </button>
        {saved && (
          <span className="inline-flex items-center justify-center gap-1 w-full text-sm font-medium text-emerald-700">
            <Check className="w-4 h-4" />
            {t('profile.preferenceSaved')}
          </span>
        )}
      </div>
    </div>
  );
}
