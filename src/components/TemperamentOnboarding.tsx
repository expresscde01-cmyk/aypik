import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useTranslation } from 'react-i18next';
import { userErrorMessage } from '@/lib/userError';
import {
  MAX_TEMPERAMENT,
  sanitizeTemperament,
} from '@/lib/temperament';
import type { ProfileGender } from '@/lib/dating';
import TemperamentPicker from '@/components/TemperamentPicker';
import TipBulb from '@/components/TipBulb';

function toggleKey(current: string[], key: string): string[] {
  if (current.includes(key)) return current.filter((item) => item !== key);
  if (current.length >= MAX_TEMPERAMENT) return current;
  return [...current, key];
}

export default function TemperamentOnboarding({
  gender,
  onDone,
}: {
  gender?: ProfileGender | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persist = async (keys: string[]) => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ temperament: sanitizeTemperament(keys) })
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
          <div className="h-full w-[92%] bg-gradient-to-r from-rose-500 to-amber-500 rounded-full" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mt-4">
          {t('temperament.signupTitle')}
        </h1>
        <p className="text-sm text-gray-500 mt-1.5">
          {t('temperament.signupHelp')}
        </p>

        <div className="bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-6 sm:p-8 mt-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm text-gray-500">{t('temperament.selection')}</p>
            <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full whitespace-nowrap">
              {selected.length} / {MAX_TEMPERAMENT}
            </span>
          </div>
          <div className="rounded-xl px-3.5 py-3 mb-5 bg-[#fff8ec] border border-[#fde7c2] border-l-4 border-l-amber-500 text-[13px] text-[#78450a] leading-relaxed">
            <strong className="flex items-center gap-[6px] text-[13.5px] text-[#5a3306] mb-0.5">
              {t('temperament.adviceTitle')}
              <TipBulb />
            </strong>
            {t('temperament.adviceBody')}
          </div>
          <TemperamentPicker
            selected={selected}
            gender={gender}
            onToggle={(key) => setSelected((prev) => toggleKey(prev, key))}
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
              disabled={saving}
              onClick={() => void persist(selected)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-bold shadow-lg shadow-rose-200 hover:opacity-95 disabled:opacity-60"
            >
              {saving ? t('profile.saving') : t('common.continue')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void persist([])}
              className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-800 disabled:opacity-60"
            >
              {t('temperament.later')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
