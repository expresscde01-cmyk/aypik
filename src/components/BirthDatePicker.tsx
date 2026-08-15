import { useEffect, useState } from 'react';
import { latestBirthDateForAge, MIN_USER_AGE } from '@/lib/dating';

const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
] as const;

const MIN_BIRTH_YEAR = 1920;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseIso(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const selectClass =
  'relative z-10 w-full px-3 py-3 rounded-xl border border-gray-200 bg-white focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 text-sm sm:text-base cursor-pointer';

type BirthDatePickerProps = {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  maxAgeDate?: string;
  className?: string;
};

/**
 * Date de naissance : listes Jour / Mois / Année.
 * État local pour les sélections partielles (sinon un clic isolé
 * remettait tout à vide et donnait l’impression que rien ne marche).
 */
export default function BirthDatePicker({
  id = 'birth-date',
  value,
  onChange,
  required = false,
  maxAgeDate = latestBirthDateForAge(MIN_USER_AGE),
  className = '',
}: BirthDatePickerProps) {
  const maxParts =
    parseIso(maxAgeDate) || parseIso(latestBirthDateForAge(MIN_USER_AGE));
  const maxYear = maxParts?.y ?? new Date().getFullYear() - MIN_USER_AGE;

  const [year, setYear] = useState(0);
  const [month, setMonth] = useState(0);
  const [day, setDay] = useState(0);

  useEffect(() => {
    const parsed = parseIso(value);
    if (!parsed) {
      if (!value) return;
      return;
    }
    setYear(parsed.y);
    setMonth(parsed.m);
    setDay(parsed.d);
  }, [value]);

  const years: number[] = [];
  for (let y = maxYear; y >= MIN_BIRTH_YEAR; y -= 1) years.push(y);

  const maxDay = year > 0 && month > 0 ? daysInMonth(year, month) : 31;

  const commit = (y: number, m: number, d: number) => {
    setYear(y);
    setMonth(m);
    setDay(d);

    if (!y || !m || !d) {
      if (value) onChange('');
      return;
    }

    const capped = Math.min(d, daysInMonth(y, m));
    if (capped !== d) setDay(capped);
    const iso = toIso(y, m, capped);
    if (iso !== value) onChange(iso);
  };

  return (
    <div className={`relative z-10 ${className}`}>
      <div className="grid grid-cols-3 gap-2">
        <div className="relative z-10">
          <label htmlFor={`${id}-day`} className="sr-only">
            Jour
          </label>
          <select
            id={`${id}-day`}
            required={required}
            value={day || ''}
            onChange={(e) => {
              const next = Number(e.target.value) || 0;
              commit(year, month, next);
            }}
            className={selectClass}
            aria-label="Jour de naissance"
          >
            <option value="">Jour</option>
            {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="relative z-10">
          <label htmlFor={`${id}-month`} className="sr-only">
            Mois
          </label>
          <select
            id={`${id}-month`}
            required={required}
            value={month || ''}
            onChange={(e) => {
              const next = Number(e.target.value) || 0;
              commit(year, next, day);
            }}
            className={selectClass}
            aria-label="Mois de naissance"
          >
            <option value="">Mois</option>
            {MONTHS_FR.map((label, i) => (
              <option key={label} value={i + 1}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="relative z-10">
          <label htmlFor={`${id}-year`} className="sr-only">
            Année
          </label>
          <select
            id={`${id}-year`}
            required={required}
            value={year || ''}
            onChange={(e) => {
              const next = Number(e.target.value) || 0;
              commit(next, month, day);
            }}
            className={selectClass}
            aria-label="Année de naissance"
          >
            <option value="">Année</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
