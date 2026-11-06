import type { CSSProperties } from 'react';
import { parseProfileGender } from '@/lib/dating';

export const GREETING_NAME_COLORS = [
  'ciel',
  'framboise',
  'lavande',
  'corail',
  'ocean',
  'nuit',
] as const;

export type GreetingNameColor = (typeof GREETING_NAME_COLORS)[number];

/** Dégradé, ou couleur unie pour « nuit ». Jamais déduit du prénom. */
export const GREETING_NAME_PAINT: Record<GreetingNameColor, string> = {
  ciel: 'linear-gradient(90deg, #2B8CBF, #1B1F3B)',
  framboise: 'linear-gradient(90deg, #F06292, #B8204A)',
  lavande: 'linear-gradient(90deg, #8E6BD8, #1B1F3B)',
  corail: 'linear-gradient(90deg, #F2552C, #F59A2C)',
  ocean: 'linear-gradient(90deg, #1BA3A3, #1F5F7A)',
  nuit: '#1B1F3B',
};

export function parseGreetingNameColor(
  value: unknown
): GreetingNameColor | null {
  if (typeof value !== 'string') return null;
  const id = value.trim().toLowerCase();
  return (GREETING_NAME_COLORS as readonly string[]).includes(id)
    ? (id as GreetingNameColor)
    : null;
}

/** Homme : Ciel. Femme : Framboise. Autre ou non précisé : Lavande. */
export function defaultGreetingNameColor(
  gender: string | null | undefined
): GreetingNameColor {
  const declared = parseProfileGender(gender);
  if (declared === 'homme') return 'ciel';
  if (declared === 'femme') return 'framboise';
  return 'lavande';
}

export function resolveGreetingNameColor(
  stored: unknown,
  gender: string | null | undefined
): GreetingNameColor {
  return parseGreetingNameColor(stored) ?? defaultGreetingNameColor(gender);
}

export function greetingNamePaintStyle(
  color: GreetingNameColor
): CSSProperties {
  const paint = GREETING_NAME_PAINT[color];
  return {
    backgroundImage: paint.startsWith('#')
      ? `linear-gradient(90deg, ${paint}, ${paint})`
      : paint,
  };
}
