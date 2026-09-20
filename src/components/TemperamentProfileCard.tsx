import { useEffect, useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
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

export default function TemperamentProfileCard({
  gender,
  initialKeys,
}: {
  gender?: ProfileGender | null;
  initialKeys?: string[] | null;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [selected, setSelected] = useState<string[]>(() =>
    sanitizeTemperament(initialKeys)
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(sanitizeTemperament(initialKeys));
  }, [initialKeys]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ temperament: sanitizeTemperament(selected) })
        .eq('id', user.id);
      if (updateError) throw updateError;
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(userErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-6 sm:p-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900">
          {t('temperament.title')}
        </h2>
        <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full whitespace-nowrap">
          {selected.length} / {MAX_TEMPERAMENT}
        </span>
      </div>
      <p className="text-sm text-gray-500 mt-1">{t('temperament.profileHelp')}</p>
      <div className="rounded-xl px-3.5 py-3 mt-4 mb-5 bg-[#fff8ec] border border-[#fde7c2] border-l-4 border-l-amber-500 text-[13px] text-[#78450a] leading-relaxed">
        <strong className="flex items-center gap-[6px] text-[13.5px] text-[#5a3306] mb-0.5">
          {t('temperament.adviceTitle')}
          <TipBulb />
        </strong>
        {t('temperament.adviceBody')}
      </div>
      <TemperamentPicker
        selected={selected}
        gender={gender}
        onToggle={(key) => {
          setSaved(false);
          setSelected((prev) => toggleKey(prev, key));
        }}
      />
      {error && (
        <div className="mt-5 flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 mt-6">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-bold shadow-lg shadow-rose-200 hover:opacity-95 disabled:opacity-60"
        >
          {saving ? t('profile.saving') : t('temperament.save')}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
            <Check className="w-4 h-4" />
            {t('temperament.saved')}
          </span>
        )}
      </div>
    </div>
  );
}
