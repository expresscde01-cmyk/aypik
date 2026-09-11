import { supabase } from '@/lib/supabase';
import i18n from '@/i18n/config';
import { currentLocale, syncDocumentMeta } from '@/i18n/documentMeta';
import type { AppLocale } from '@/i18n/locales';
import { rewriteLocationToLocale } from '@/i18n/path';
import { writeStoredLocale } from '@/i18n/storage';

export async function persistProfileLocale(
  userId: string,
  locale: AppLocale
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ preferred_locale: locale })
    .eq('id', userId);
  if (error) {
    console.warn('preferred_locale update failed', error.message);
  }
}

export async function applyLocale(
  locale: AppLocale,
  opts?: { userId?: string | null; persistProfile?: boolean }
): Promise<void> {
  if (currentLocale() !== locale) {
    await i18n.changeLanguage(locale);
  }
  writeStoredLocale(locale);
  rewriteLocationToLocale(locale);
  syncDocumentMeta(locale);
  if (opts?.persistProfile && opts.userId) {
    await persistProfileLocale(opts.userId, locale);
  }
}
