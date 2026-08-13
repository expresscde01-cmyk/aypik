export function ageFromBirthDate(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
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
