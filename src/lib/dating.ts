export function ageFromBirthDate(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function minPartnerAge(age: number): number {
  return Math.floor(age / 2) + 7;
}

export function isWithinAgeGap(myAge: number, partnerAge: number): boolean {
  return partnerAge >= minPartnerAge(myAge);
}
