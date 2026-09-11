import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { applyLocale, persistProfileLocale } from '@/i18n/applyLocale';
import { currentLocale } from '@/i18n/documentMeta';
import { isSupportedLocale } from '@/i18n/locales';
import { stripLocalePrefix } from '@/i18n/path';

export default function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      syncedFor.current = null;
      return;
    }
    if (syncedFor.current === user.id) return;
    syncedFor.current = user.id;

    void (async () => {
      const { prefix, hadPrefix } = stripLocalePrefix(window.location.pathname);
      if (hadPrefix && prefix && prefix !== 'fr') {
        await persistProfileLocale(user.id, prefix);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('preferred_locale')
        .eq('id', user.id)
        .maybeSingle();
      const fromProfile = data?.preferred_locale;
      if (isSupportedLocale(fromProfile) && fromProfile !== currentLocale()) {
        await applyLocale(fromProfile);
        return;
      }
      if (!isSupportedLocale(fromProfile)) {
        await persistProfileLocale(user.id, currentLocale());
      }
    })();
  }, [user?.id]);

  return children;
}
