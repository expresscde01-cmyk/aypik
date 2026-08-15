export type ProfileGender = 'homme' | 'femme';

export const MIN_USER_AGE = 18;

export const ADULTS_ONLY_MESSAGE =
  'Ce service est exclusivement réservé aux personnes majeures.';

/** Homme → femmes, femme → hommes, non renseigné → pas de filtre. */
export function matchingTargetGender(
  viewerGender: string | null | undefined
): ProfileGender | null {
  if (viewerGender === 'homme') return 'femme';
  if (viewerGender === 'femme') return 'homme';
  return null;
}

function birthDateParts(
  birthDate: string
): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate.trim());
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return { y, m, d };
    }
    return null;
  }
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  return {
    y: birth.getFullYear(),
    m: birth.getMonth() + 1,
    d: birth.getDate(),
  };
}

export function ageFromBirthDate(birthDate: string): number {
  const parts = birthDateParts(birthDate);
  if (!parts) return NaN;
  const today = new Date();
  let age = today.getFullYear() - parts.y;
  const tm = today.getMonth() + 1;
  const td = today.getDate();
  if (tm < parts.m || (tm === parts.m && td < parts.d)) age--;
  return age;
}

/** 18 ans révolus à la date du jour. */
export function isAdult(birthDate: string | null | undefined): boolean {
  if (!birthDate) return false;
  const age = ageFromBirthDate(birthDate);
  return Number.isFinite(age) && age >= MIN_USER_AGE;
}

/** Classic half-plus-seven: floor(age / 2) + 7. */
export function minPartnerAge(age: number): number {
  return Math.floor(age / 2) + 7;
}

/** Partner is allowed if their age is not below the viewer's half-plus-seven. */
export function isWithinAgeGap(myAge: number, partnerAge: number): boolean {
  return partnerAge >= minPartnerAge(myAge);
}

/** Latest YYYY-MM-DD a partner may have been born to be at least `minAge` today. */
export function latestBirthDateForAge(minAge: number): string {
  const today = new Date();
  const d = new Date(
    today.getFullYear() - minAge,
    today.getMonth(),
    today.getDate()
  );
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
