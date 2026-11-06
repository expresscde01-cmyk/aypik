import { TEMPERAMENT_FAMILIES, MAX_TEMPERAMENT, getTemperamentLabel } from '@/lib/temperament';
import type { ProfileGender } from '@/lib/dating';
import { useTranslation } from 'react-i18next';

export default function TemperamentPicker({
  selected,
  gender,
  onToggle,
  unlimited = false,
  selection = 'multiple',
}: {
  selected: readonly string[];
  gender?: ProfileGender | null;
  onToggle: (key: string) => void;
  unlimited?: boolean;
  /** radio : un seul choix par échelle. multiple : filtre de recherche. */
  selection?: 'radio' | 'multiple';
}) {
  const { t, i18n } = useTranslation();
  const selectedSet = new Set(selected);
  const full = !unlimited && selectedSet.size >= MAX_TEMPERAMENT;
  const lang = i18n.language;

  return (
    <div className="space-y-5">
      {TEMPERAMENT_FAMILIES.map((family) => {
        const n = family.keys.length;
        const selectedIndexes = family.keys.flatMap((key, index) =>
          selectedSet.has(key) ? [index] : []
        );
        const markerIndex =
          selection === 'radio'
            ? selectedIndexes.length === 1
              ? selectedIndexes[0]
              : null
            : null;
        const familyLabel = t(`temperament.families.${family.id}`);
        return (
          <div key={family.id} className="temperament-family">
            <div className="flex items-baseline justify-between gap-3">
              <p className="temperament-family-title">
                {t(`temperament.families.${family.id}`)}
              </p>
              <p className="temperament-poles">
                <em className="not-italic">
                  {t(`temperament.poles.${family.id}From`)}
                </em>
                <span aria-hidden>→</span>
                <em className="not-italic">
                  {t(`temperament.poles.${family.id}To`)}
                </em>
              </p>
            </div>
            <div className="temperament-track" aria-hidden="true">
              {selection === 'radio'
                ? markerIndex != null && (
                    <span
                      className="temperament-marker"
                      aria-hidden="true"
                      style={{
                        left:
                          n <= 1 ? '0%' : `${(markerIndex / (n - 1)) * 100}%`,
                      }}
                    />
                  )
                : selectedIndexes.map((index) => (
                    <span
                      key={family.keys[index]}
                      className="temperament-marker"
                      aria-hidden="true"
                      style={{
                        left: n <= 1 ? '0%' : `${(index / (n - 1)) * 100}%`,
                      }}
                    />
                  ))}
            </div>
            <div
              className="flex flex-wrap gap-2"
              {...(selection === 'radio'
                ? { role: 'radiogroup' as const, 'aria-label': familyLabel }
                : {})}
            >
              {family.keys.map((key) => {
                const on = selectedSet.has(key);
                const familyHasChoice = selectedIndexes.length > 0;
                const disabled =
                  selection === 'radio'
                    ? full && !familyHasChoice && !on
                    : full && !on;
                const label = getTemperamentLabel(key, gender, lang);
                return (
                  <button
                    key={key}
                    type="button"
                    {...(selection === 'radio'
                      ? { role: 'radio' as const, 'aria-checked': on }
                      : { 'aria-pressed': on })}
                    disabled={disabled}
                    onClick={() => onToggle(key)}
                    className={`temperament-chip ${on ? 'temperament-chip--on' : ''}`}
                  >
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
