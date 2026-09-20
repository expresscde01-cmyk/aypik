import type { Ref } from 'react';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  MAX_TEMPERAMENT,
  sanitizeTemperament,
} from '@/lib/temperament';
import type { ProfileGender } from '@/lib/dating';
import TemperamentPicker from '@/components/TemperamentPicker';
import TipBulb from '@/components/TipBulb';

export function toggleTemperamentKey(current: string[], key: string): string[] {
  if (current.includes(key)) return current.filter((item) => item !== key);
  if (current.length >= MAX_TEMPERAMENT) return current;
  return [...current, key];
}

export default function TemperamentProfileCard({
  gender,
  selected,
  onToggle,
  error,
  cardRef,
}: {
  gender?: ProfileGender | null;
  selected: string[];
  onToggle: (key: string) => void;
  error?: string | null;
  cardRef?: Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation();
  const selectedKeys = sanitizeTemperament(selected);

  return (
    <div
      ref={cardRef}
      className="mt-6 bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-6 sm:p-8"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900">
          {t('temperament.title')}
        </h2>
        <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full whitespace-nowrap">
          {selectedKeys.length} / {MAX_TEMPERAMENT}
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
        selected={selectedKeys}
        gender={gender}
        onToggle={onToggle}
      />
      {error && (
        <div className="mt-5 flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
