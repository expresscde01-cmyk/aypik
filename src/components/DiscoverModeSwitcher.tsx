import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useMembership } from '@/lib/useMembership';
import { isMessagingLocked } from '@/lib/membership';
import { openHighlightOffer } from '@/lib/conversionNav';
import {
  parseDiscoverMode,
  type DiscoverMode,
} from '@/lib/discoverMode';

const OPTIONS = [
  { id: 'detaille' as const, labelKey: 'profile.discoverModeDetailed' as const },
  { id: 'simplifie' as const, labelKey: 'profile.discoverModeSimplified' as const },
];

export default function DiscoverModeSwitcher({
  value,
  onChange,
}: {
  value?: DiscoverMode | null;
  onChange?: (mode: DiscoverMode) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { status, loading } = useMembership();
  const [mode, setMode] = useState<DiscoverMode>(parseDiscoverMode(value));
  const [busy, setBusy] = useState(false);
  const locked = !loading && isMessagingLocked(status);

  useEffect(() => {
    setMode(parseDiscoverMode(value));
  }, [value]);

  useEffect(() => {
    if (!user?.id || value) return;
    let active = true;
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('discover_mode')
        .eq('id', user.id)
        .maybeSingle();
      if (!active || !data) return;
      setMode(parseDiscoverMode(data.discover_mode));
    })();
    return () => {
      active = false;
    };
  }, [user?.id, value]);

  const select = async (next: DiscoverMode) => {
    if (locked) {
      openHighlightOffer(next);
      return;
    }
    if (!user?.id || next === mode || busy) return;
    const prev = mode;
    setMode(next);
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({ discover_mode: next })
      .eq('id', user.id);
    setBusy(false);
    if (error) {
      setMode(prev);
      return;
    }
    onChange?.(next);
  };

  return (
    <div className="space-y-1.5">
      <div
        role="group"
        aria-label={t('profile.discoverMode')}
        aria-disabled={locked || undefined}
        className={`inline-flex w-full items-center rounded-lg border border-rose-100 bg-white/80 p-0.5 ${
          locked ? 'opacity-55 grayscale select-none' : ''
        }`}
      >
        {OPTIONS.map((option) => {
          const selected = mode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              disabled={busy && !locked}
              title={locked ? t('membership.lockedNeedOffer') : undefined}
              onClick={() => void select(option.id)}
              className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold tracking-wide transition-colors disabled:opacity-60 ${
                selected
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-rose-600 hover:bg-rose-50'
              }`}
            >
              {t(option.labelKey)}
            </button>
          );
        })}
      </div>
      {locked ? (
        <p className="text-[11px] leading-snug text-gray-500">
          {t('membership.lockedNeedOffer')}
        </p>
      ) : mode === 'simplifie' ? (
        <p className="text-[11px] leading-snug text-gray-500">
          {t('profile.discoverModeSimplifiedHint')}
        </p>
      ) : null}
    </div>
  );
}
