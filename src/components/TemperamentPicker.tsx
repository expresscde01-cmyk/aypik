import { TEMPERAMENT_FAMILIES, MAX_TEMPERAMENT, temperamentDotOpacity, getTemperamentLabel } from '@/lib/temperament';
import type { ProfileGender } from '@/lib/dating';
import { useTranslation } from 'react-i18next';

export default function TemperamentPicker({
  selected,
  gender,
  onToggle,
  unlimited = false,
}: {
  selected: readonly string[];
  gender?: ProfileGender | null;
  onToggle: (key: string) => void;
  unlimited?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const selectedSet = new Set(selected);
  const full = !unlimited && selectedSet.size >= MAX_TEMPERAMENT;
  const lang = i18n.language;

  return (
    <div className="space-y-5">
      {TEMPERAMENT_FAMILIES.map((family) => {
        const n = family.keys.length;
        return (
          <div key={family.id} className="temperament-family">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-gray-900">
                {t(`temperament.families.${family.id}`)}
              </p>
              <p className="text-[11.5px] text-gray-500 flex items-center gap-1.5 shrink-0">
                <em className="not-italic">
                  {t(`temperament.poles.${family.id}From`)}
                </em>
                <span className="text-rose-500 font-bold" aria-hidden>
                  →
                </span>
                <em className="not-italic">
                  {t(`temperament.poles.${family.id}To`)}
                </em>
              </p>
            </div>
            <div className="temperament-track" aria-hidden />
            <div className="flex flex-wrap gap-2">
              {family.keys.map((key, index) => {
                const on = selectedSet.has(key);
                const disabled = full && !on;
                const label = getTemperamentLabel(key, gender, lang);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => onToggle(key)}
                    className={`temperament-chip ${on ? 'temperament-chip--on' : ''}`}
                  >
                    <span
                      className="temperament-dot"
                      style={{ opacity: temperamentDotOpacity(index, n) }}
                      aria-hidden
                    />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
