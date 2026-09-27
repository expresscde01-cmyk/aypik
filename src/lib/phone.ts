/**
 * Vérification SMS : France, outre-mer français, Union européenne
 * et quelques pays d'Europe. France par défaut.
 * La liste d'indicatifs en base (phone_sms_country_prefixes) doit rester
 * le même ensemble, sans doublon.
 */
import {
  getCountryCallingCode,
  getExampleNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';
import examples from 'libphonenumber-js/mobile/examples';

/** Ordre d'affichage de référence. La France reste le premier choix. */
export const PHONE_VERIFICATION_COUNTRIES = [
  'FR',
  'GP',
  'BL',
  'MF',
  'MQ',
  'GF',
  'PM',
  'NC',
  'PF',
  'WF',
  'DE',
  'AT',
  'BE',
  'BG',
  'CY',
  'HR',
  'DK',
  'ES',
  'EE',
  'FI',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'CZ',
  'RO',
  'SK',
  'SI',
  'SE',
  'GB',
  'CH',
  'NO',
  'IS',
  'LI',
  'MC',
  'AD',
] as const satisfies readonly CountryCode[];

export type PhoneVerificationCountry =
  (typeof PHONE_VERIFICATION_COUNTRIES)[number];

const PHONE_VERIFICATION_COUNTRY_SET = new Set<CountryCode>(
  PHONE_VERIFICATION_COUNTRIES
);

const ownsPlanCache = new Map<CountryCode, boolean>();

export function isPhoneVerificationCountry(
  country: string
): country is PhoneVerificationCountry {
  return PHONE_VERIFICATION_COUNTRY_SET.has(country as CountryCode);
}

/**
 * Indicatifs uniques, dans l'ordre des territoires.
 * Guadeloupe, Saint-Barthélemy et Saint-Martin partagent +590.
 */
export function phoneVerificationPrefixes(): string[] {
  const seen = new Set<string>();
  const prefixes: string[] = [];
  for (const country of PHONE_VERIFICATION_COUNTRIES) {
    const prefix = `+${getCountryCallingCode(country)}`;
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    prefixes.push(prefix);
  }
  return prefixes;
}

/**
 * Saint-Barthélemy et Saint-Martin n'ont pas de plan de numérotation
 * distinct de la Guadeloupe : libphonenumber les classe en GP.
 */
function countryOwnsPlan(country: CountryCode): boolean {
  const cached = ownsPlanCache.get(country);
  if (cached !== undefined) return cached;
  const example = getExampleNumber(country, examples);
  const parsed = example
    ? parsePhoneNumberFromString(example.formatNational(), country)
    : undefined;
  const owns = parsed?.country === country;
  ownsPlanCache.set(country, owns);
  return owns;
}

/**
 * Numéro national ou international saisi pour le pays choisi.
 * Retourne l'E.164, ou null si le pays n'est pas ouvert ou si le numéro
 * n'est pas valable pour ce pays.
 */
export function toE164Phone(
  raw: string,
  country: PhoneVerificationCountry
): string | null {
  if (!isPhoneVerificationCountry(country)) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, country);
  if (!parsed?.isValid()) return null;
  if (parsed.countryCallingCode !== getCountryCallingCode(country)) return null;
  if (!parsed.country || parsed.country === country) return parsed.number;
  if (!isPhoneVerificationCountry(parsed.country)) return null;
  if (countryOwnsPlan(country)) return null;
  if (getCountryCallingCode(parsed.country) !== parsed.countryCallingCode) {
    return null;
  }
  return parsed.number;
}

export function phoneNationalPlaceholder(
  country: PhoneVerificationCountry
): string {
  return getExampleNumber(country, examples)?.formatNational() ?? '';
}

export function formatE164ForDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed?.isValid()) return e164;
  return parsed.formatInternational();
}

/**
 * Date de mise en ligne de la vérification téléphone obligatoire.
 * Les comptes créés AVANT cette date ne sont pas bloqués rétroactivement
 * (ils n'ont jamais eu l'occasion de vérifier un numéro à l'inscription) ;
 * seuls les comptes créés à partir de cette date doivent vérifier leur
 * numéro avant d'accéder au site. Voir AppShell.tsx.
 */
export const PHONE_VERIFICATION_REQUIRED_SINCE = '2026-08-25T12:35:00Z';

export const PHONE_OTP_LENGTH = 6;

export function isValidOtpCode(code: string): boolean {
  return new RegExp(`^\\d{${PHONE_OTP_LENGTH}}$`).test(code.trim());
}
