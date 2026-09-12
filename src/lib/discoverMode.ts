export type DiscoverMode = 'detaille' | 'simplifie';

export function parseDiscoverMode(value: unknown): DiscoverMode {
  return value === 'simplifie' ? 'simplifie' : 'detaille';
}

export function isSimplifiedDiscoverMode(value: unknown): boolean {
  return parseDiscoverMode(value) === 'simplifie';
}
