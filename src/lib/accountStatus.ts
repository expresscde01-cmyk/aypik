import { supabase } from '@/lib/supabase';
import { t } from '../i18n/t.ts';

/** Statuts de compte affichés dans le header. Extensible sans changer le markup. */
export type AccountStatusId = 'paused' | 'deactivated' | 'incognito';

export type VisibilityChoice =
  | 'visible'
  | 'paused'
  | 'deactivated'
  | 'incognito';

export type AccountStatusFlags = {
  paused?: boolean;
  deactivated?: boolean;
  incognito?: boolean;
};

/** Ordre d’affichage si plusieurs statuts sont actifs. */
const STATUS_ORDER: AccountStatusId[] = [
  'deactivated',
  'paused',
  'incognito',
];

export function resolveAccountStatuses(
  flags: AccountStatusFlags
): AccountStatusId[] {
  return STATUS_ORDER.filter((id) => Boolean(flags[id]));
}

export function resolveVisibilityChoice(
  flags: AccountStatusFlags
): VisibilityChoice {
  if (flags.paused) return 'paused';
  if (flags.deactivated) return 'deactivated';
  if (flags.incognito) return 'incognito';
  return 'visible';
}

/** Libellé d’état affiché après « Visibilité – » dans le menu. */
export function visibilityMenuHint(choice: VisibilityChoice): string {
  if (choice === 'paused') return t('profile.visibilityHintPaused');
  if (choice === 'deactivated') return t('profile.visibilityHintDeactivated');
  if (choice === 'incognito') return t('profile.visibilityIncognito');
  return t('profile.visibilityNormal');
}

export function visibilityRadioOptions(): {
  id: VisibilityChoice;
  label: string;
}[] {
  return [
    { id: 'visible', label: t('profile.visibilityNormal') },
    { id: 'incognito', label: t('profile.visibilityIncognito') },
    {
      id: 'paused',
      label: t('profile.visibilityPaused'),
    },
    { id: 'deactivated', label: t('profile.visibilityDeactivated') },
  ];
}

const ACCOUNT_STATUS_HOME_BANNER_CLASS: Record<AccountStatusId, string> = {
  paused:
    'text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5 max-w-md mx-auto leading-relaxed',
  deactivated:
    'text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 max-w-md mx-auto leading-relaxed',
  incognito:
    'text-sm text-violet-800 bg-violet-50 border border-violet-100 rounded-xl px-4 py-2.5 max-w-md mx-auto leading-relaxed',
};

const ACCOUNT_STATUS_HOME_BANNER_KEY: Record<AccountStatusId, string> = {
  paused: 'profile.bannerPaused',
  deactivated: 'profile.bannerDeactivated',
  incognito: 'profile.bannerIncognito',
};

export function accountStatusHomeBanner(id: AccountStatusId): {
  text: string;
  className: string;
} {
  return {
    text: t(ACCOUNT_STATUS_HOME_BANNER_KEY[id]),
    className: ACCOUNT_STATUS_HOME_BANNER_CLASS[id],
  };
}

/** Corps de la modale de confirmation avant mise en pause (conditionnel). */
export function accountPauseConfirmDescription(): string {
  return t('profile.pauseConfirmDescription');
}

const visibilityUiKey = (userId: string) =>
  `aypik.accountVisibilityUi.${userId}`;

export function loadVisibilityUiMode(
  userId: string
): 'deactivated' | 'incognito' | null {
  try {
    const raw = localStorage.getItem(visibilityUiKey(userId));
    if (raw === 'deactivated' || raw === 'incognito') return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveVisibilityUiMode(
  userId: string,
  mode: 'deactivated' | 'incognito' | null
) {
  try {
    if (!mode) localStorage.removeItem(visibilityUiKey(userId));
    else localStorage.setItem(visibilityUiKey(userId), mode);
  } catch {
    /* ignore */
  }
}

export type MyAccountFlags = {
  paused_at: string | null;
  incognito_at: string | null;
  deactivated_at: string | null;
};

/** Drapeaux du compte connecté — RPC SECURITY DEFINER (pas de SELECT incognito_at). */
export async function fetchMyAccountFlags(): Promise<MyAccountFlags | null> {
  const { data, error } = await supabase.rpc('my_account_flags');
  if (!error && data != null) {
    const row = (Array.isArray(data) ? data[0] : data) as
      | Partial<MyAccountFlags>
      | undefined;
    if (row && typeof row === 'object') {
      return {
        paused_at: row.paused_at ?? null,
        incognito_at: row.incognito_at ?? null,
        deactivated_at: row.deactivated_at ?? null,
      };
    }
  }

  const { data: auth } = await supabase.auth.getUser();
  const id = auth.user?.id;
  if (!id) return null;

  const fallback = await supabase
    .from('profiles')
    .select('paused_at, deactivated_at')
    .eq('id', id)
    .maybeSingle();
  if (fallback.error || !fallback.data) return null;
  const row = fallback.data as {
    paused_at?: string | null;
    deactivated_at?: string | null;
  };
  return {
    paused_at: row.paused_at ?? null,
    incognito_at: null,
    deactivated_at: row.deactivated_at ?? null,
  };
}
