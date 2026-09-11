import type { TOptions } from 'i18next';
import i18n from './config';

const translate = i18n.t.bind(i18n) as (
  key: string,
  options?: TOptions
) => string;

export function t(key: string, options?: TOptions): string {
  return translate(key, options);
}

export { i18n };
