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

/** Texte entre parenthèses sur la ligne Visibilité du menu. */
export function visibilityMenuHint(choice: VisibilityChoice): string | null {
  if (choice === 'paused') return 'Hors découverte';
  if (choice === 'deactivated') return 'Compte désactivé';
  if (choice === 'incognito') return 'Incognito';
  return null;
}

export const VISIBILITY_RADIO_OPTIONS: {
  id: VisibilityChoice;
  label: string;
}[] = [
  { id: 'visible', label: 'Visible normalement' },
  {
    id: 'paused',
    label: 'Ne plus apparaître dans Découvrir et Suggestions',
  },
  { id: 'deactivated', label: 'Désactiver mon compte' },
  { id: 'incognito', label: 'Incognito' },
];

export const ACCOUNT_STATUS_HOME_BANNER: Record<
  AccountStatusId,
  { text: string; className: string }
> = {
  paused: {
    text: 'Tu n’apparais plus dans Découvrir ni dans Suggestions pour toi.',
    className:
      'text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5 max-w-md mx-auto leading-relaxed',
  },
  deactivated: {
    text: 'Ton compte est désactivé : tu ne peux plus interagir avec l’application tant que tu ne l’as pas réactivé.',
    className:
      'text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 max-w-md mx-auto leading-relaxed',
  },
  incognito: {
    text: 'Le mode Incognito est activé : tu utilises l’application sans apparaître en ligne aux yeux des autres membres.',
    className:
      'text-sm text-violet-800 bg-violet-50 border border-violet-100 rounded-xl px-4 py-2.5 max-w-md mx-auto leading-relaxed',
  },
};

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
