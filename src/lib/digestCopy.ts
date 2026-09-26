import { t } from '../i18n/t.ts';

function firstNameOf(name?: string | null): string | null {
  const token = (name || '').trim().split(/\s+/)[0];
  return token ? token : null;
}

export function digestFirstName(name?: string | null): string {
  return firstNameOf(name) || t('common.someone');
}

export type DigestPerson = { id: string; name: string };

/**
 * 1 à 3 prénoms in extenso ; au-delà : « Paul, OK5 et 5 autres ».
 * Le nombre n’est jamais une donnée séparée : c’est la longueur de la liste.
 */
export function formatDigestNameList(names: string[]): string {
  const cleaned = names
    .map((n) => firstNameOf(n) || '')
    .filter((n) => n.length > 0);
  const n = cleaned.length;
  if (n === 0) return '';
  if (n === 1) return cleaned[0];
  const and = t('common.and');
  if (n === 2) return `${cleaned[0]} ${and} ${cleaned[1]}`;
  if (n === 3) return `${cleaned[0]}, ${cleaned[1]} ${and} ${cleaned[2]}`;
  if (n === 4) {
    return `${cleaned[0]}, ${cleaned[1]}, ${cleaned[2]} ${and} ${cleaned[3]}`;
  }
  const rest = n - 2;
  return t('common.andOthers', {
    count: rest,
    name1: cleaned[0],
    name2: cleaned[1],
  });
}

export function sliceDigestPeople<T extends { name: string }>(
  people: T[]
): { shown: T[]; extra: number } {
  if (people.length <= 4) return { shown: people, extra: 0 };
  return { shown: people.slice(0, 2), extra: people.length - 2 };
}

export function resolveDigestPeople(
  ids: string[],
  namesById: Record<string, string | undefined | null>
): DigestPerson[] {
  return (ids || []).filter(Boolean).map((id) => ({
    id,
    name: digestFirstName(namesById[id]),
  }));
}

function bodyWithNames(
  names: string[],
  one: (list: string) => string,
  many: (list: string) => string,
  empty: string
): string {
  const list = formatDigestNameList(names);
  if (!list) return empty;
  return names.length <= 1 ? one(list) : many(list);
}

export function newProfilesNotificationCopy(names: string[]): {
  title: string;
  body: string;
} {
  return {
    title: t('notifications.digestDiscoverTitle'),
    body: bodyWithNames(
      names,
      (list) => t('notifications.digestDiscoverOne', { names: list }),
      (list) => t('notifications.digestDiscoverMany', { names: list }),
      t('notifications.digestDiscoverEmpty')
    ),
  };
}

export function waitingProfilesNotificationCopy(names: string[]): {
  title: string;
  body: string;
} {
  return {
    title: t('notifications.waitingTitle'),
    body: bodyWithNames(
      names,
      (list) => t('notifications.waitReminderBody', { name: list }),
      (list) => t('notifications.waitReminderBody', { name: list }),
      t('notifications.digestWaitingEmpty')
    ),
  };
}

/** Au moins une a déjà écrit (badge non lu / message reçu) vs personne n’a encore écrit. */
export type FirstDigestTone = 'write' | 'reply' | 'mixed';

/** Délai après mon dernier message avant d’afficher « Relance possible ». */
export const FOLLOW_UP_MIN_AGE_MS = 72 * 60 * 60 * 1000;
/** Au-delà, plus de proposition de relance (jusqu’à un nouvel envoi). */
export const FOLLOW_UP_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function isFollowUpInWindow(
  lastSentAtMs: number | null | undefined,
  nowMs: number,
  minAgeMs = FOLLOW_UP_MIN_AGE_MS,
  maxAgeMs = FOLLOW_UP_MAX_AGE_MS
): boolean {
  if (lastSentAtMs == null || !Number.isFinite(lastSentAtMs)) return false;
  const age = nowMs - lastSentAtMs;
  return age >= minAgeMs && age <= maxAgeMs;
}

function lastSentMsOf(
  id: string,
  lastSentAt: Readonly<Record<string, number>> | ReadonlyMap<string, number>
): number | null {
  if (lastSentAt instanceof Map) {
    const value = lastSentAt.get(id);
    return value == null ? null : value;
  }
  const value = lastSentAt[id];
  return value == null ? null : value;
}

export function firstDigestTone(
  ids: readonly string[],
  wroteToMe: Iterable<string>
): FirstDigestTone {
  const inbound = new Set(
    [...wroteToMe].filter((id): id is string => Boolean(id))
  );
  let write = 0;
  let reply = 0;
  for (const id of ids) {
    if (!id) continue;
    if (inbound.has(id)) reply += 1;
    else write += 1;
  }
  if (reply === 0) return 'write';
  if (write === 0) return 'reply';
  return 'mixed';
}

/**
 * « 1er mot » tant que les deux n’ont pas écrit.
 * « Relance possible » s’ajoute entre 72 h et 14 j après mon dernier envoi.
 */
export function partitionQuietDigestIds(
  ids: readonly string[],
  wroteFromMe: Iterable<string>,
  wroteToMe: Iterable<string>,
  lastSentAt: Readonly<Record<string, number>> | ReadonlyMap<string, number> = {},
  nowMs = Date.now()
): { firstWordIds: string[]; followUpIds: string[] } {
  const fromMe = new Set(
    [...wroteFromMe].filter((id): id is string => Boolean(id))
  );
  const toMe = new Set(
    [...wroteToMe].filter((id): id is string => Boolean(id))
  );
  const firstWordIds: string[] = [];
  const followUpIds: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    const iWrote = fromMe.has(id);
    const theyWrote = toMe.has(id);
    if (iWrote && theyWrote) continue;
    if (
      iWrote &&
      !theyWrote &&
      isFollowUpInWindow(lastSentMsOf(id, lastSentAt), nowMs)
    ) {
      followUpIds.push(id);
    }
    firstWordIds.push(id);
  }
  return { firstWordIds, followUpIds };
}

/**
 * Verrou « qui a déjà écrit » de la cloche.
 * `ready` n’est vrai qu’après un chargement réussi de ce compte.
 * Un échec ne le ouvre pas : une liste vide ne veut pas dire « personne n’a écrit ».
 */
export type BellDialogueGate = {
  accountId: string | null;
  ready: boolean;
  /** Échec du chargement : la carte « 1er mot » s'affiche quand même. */
  failed: boolean;
  wroteFromMe: string[];
  wroteToMe: string[];
  lastSentAt: Record<string, number>;
};

export function emptyBellDialogueGate(): BellDialogueGate {
  return {
    accountId: null,
    ready: false,
    failed: false,
    wroteFromMe: [],
    wroteToMe: [],
    lastSentAt: {},
  };
}

/** Nouveau compte : aucune donnée du précédent, carte masquée jusqu’au prochain succès. */
export function switchBellDialogueAccount(
  accountId: string | null
): BellDialogueGate {
  return { ...emptyBellDialogueGate(), accountId };
}

export function applyBellDialogueRefresh(
  gate: BellDialogueGate,
  result:
    | { ok: false; accountId: string }
    | {
        ok: true;
        accountId: string;
        wroteFromMe: Iterable<string>;
        wroteToMe: Iterable<string>;
        lastSentAt?: Readonly<Record<string, number>>;
      }
): BellDialogueGate {
  if (result.accountId !== gate.accountId) return gate;
  if (!result.ok) {
    if (gate.ready) return gate;
    return { ...gate, failed: true };
  }
  return {
    accountId: gate.accountId,
    ready: true,
    failed: false,
    wroteFromMe: [...result.wroteFromMe].filter((id) => Boolean(id)),
    wroteToMe: [...result.wroteToMe].filter((id) => Boolean(id)),
    lastSentAt: { ...(result.lastSentAt ?? {}) },
  };
}

/** « 1er mot » : la visite et un message non lu ne retirent personne. */
export function firstWordNotificationIds(ids: readonly string[]): string[] {
  return ids.filter((id) => Boolean(id));
}

/** Une nouvelle session ou une reconnexion rouvre la notification « 1er mot ». */
export function firstWordDismissedAfterSessionStart(
  _storedDismissed: boolean
): boolean {
  return false;
}

/**
 * Après un échec, un retour au premier plan ou du réseau relance un chargement
 * pour ce compte seulement. Pas de second essai pendant qu’un essai tourne,
 * ni une fois le verrou ouvert.
 */
export function shouldRetryBellDialogue(input: {
  accountId: string | null;
  gate: BellDialogueGate;
  inFlight: boolean;
  reason: 'visible' | 'online';
  /** `visibilitychange` part aussi vers l’arrière-plan : seul `visible` relance. */
  visibilityState?: string;
}): boolean {
  if (!input.accountId || input.accountId !== input.gate.accountId) return false;
  if (input.gate.ready || input.inFlight) return false;
  if (input.reason === 'online') return true;
  return input.visibilityState === 'visible';
}

/** Effets propres à l’écran Mes Matchs : ils ne partent pas tant que la page n’est pas ouverte. */
export const MATCHES_PAGE_MOUNT_EFFECTS = [
  'marquage-vu',
  'badge-nouveau',
  'statistique-visite',
  'images-fiches',
  'chargeurs-archives',
] as const;

export function matchesPageEffectsFired(pageMounted: boolean): readonly string[] {
  return pageMounted ? MATCHES_PAGE_MOUNT_EFFECTS : [];
}

/** Première ouverture : réutiliser la liste déjà chargée. Les visites suivantes peuvent rafraîchir. */
export function shouldFullLoadMatchesOnPageOpen(input: {
  alreadyLoaded: boolean;
  openedBefore: boolean;
  inFlight: boolean;
}): boolean {
  if (input.inFlight) return false;
  if (!input.alreadyLoaded) return true;
  return input.openedBefore;
}

/**
 * Carte « 1er mot » / relance.
 * Un match reste dans « 1er mot » tant que les deux n’ont pas écrit, quel que soit le délai.
 * En Simplifié, entre 72 h et 14 j après mon dernier message, il est aussi sur « Relance possible ».
 * `dialogueReady` ne fait que retarder l’affichage le temps de connaître qui a déjà écrit.
 * Si ce chargement échoue, la carte s’affiche quand même avec les matchs connus.
 */
export function firstWordDigestAlert(input: {
  simplified: boolean;
  dialogueReady: boolean;
  /** Échec connu du chargement « qui a écrit ». */
  dialogueFailed?: boolean;
  dismissed: boolean;
  quietIds: readonly string[];
  wroteFromMe: Iterable<string>;
  wroteToMe: Iterable<string>;
  lastSentAt?: Readonly<Record<string, number>> | ReadonlyMap<string, number>;
  /** Liste Mes Matchs chargée avec succès. Absent = déjà connue (tests historiques). */
  matchesReady?: boolean;
  nowMs?: number;
}): {
  firstWordIds: string[];
  followUpIds: string[];
  alert: boolean;
  showFirstWord: boolean;
} {
  const split = partitionQuietDigestIds(
    input.quietIds,
    input.wroteFromMe,
    input.wroteToMe,
    input.lastSentAt ?? {},
    input.nowMs
  );
  const followUpIds = input.simplified ? split.followUpIds : [];
  const pending = split.firstWordIds.length + followUpIds.length > 0;
  const matchesKnown = input.matchesReady !== false;
  const classified =
    !input.simplified ||
    (matchesKnown && (input.dialogueReady || input.dialogueFailed === true));
  const alert = pending && !input.dismissed && classified;
  return {
    firstWordIds: split.firstWordIds,
    followUpIds,
    alert,
    showFirstWord: alert && split.firstWordIds.length > 0,
  };
}

export type FirstWordChainStop =
  | 'affiche'
  | 'verrou-dialogue'
  | 'snapshot-matchs'
  | 'fermee-session'
  | 'aucun-match'
  | 'tri-qui-a-ecrit';

/**
 * Pourquoi « 1er mot » peut être visible en Détaillé et absent en Simplifié.
 * `firstDismissed` n’est pas lié au mode : la même clé de session masque les deux.
 */
export function explainFirstWordChain(input: {
  dialogueReady: boolean;
  matchesReady: boolean;
  dismissed: boolean;
  quietIds: readonly string[];
  wroteFromMe: Iterable<string>;
  wroteToMe: Iterable<string>;
  lastSentAt?: Readonly<Record<string, number>> | ReadonlyMap<string, number>;
  nowMs?: number;
}): {
  stop: FirstWordChainStop;
  simplifiedEligible: number;
  detailedEligible: number;
  simplifiedShow: boolean;
  detailedShow: boolean;
  hidesDetailedToo: boolean;
  exclusions: { id: string; reason: string }[];
} {
  const shared = {
    dialogueReady: input.dialogueReady,
    matchesReady: input.matchesReady,
    dismissed: input.dismissed,
    quietIds: input.quietIds,
    wroteFromMe: input.wroteFromMe,
    wroteToMe: input.wroteToMe,
    lastSentAt: input.lastSentAt,
    nowMs: input.nowMs,
  };
  const detailed = firstWordDigestAlert({ ...shared, simplified: false });
  const simplified = firstWordDigestAlert({ ...shared, simplified: true });
  const split = partitionQuietDigestIds(
    input.quietIds,
    input.wroteFromMe,
    input.wroteToMe,
    input.lastSentAt ?? {},
    input.nowMs
  );
  const shown = new Set(simplified.showFirstWord ? split.firstWordIds : []);
  const exclusions: { id: string; reason: string }[] = [];
  for (const id of input.quietIds) {
    if (!id || shown.has(id)) continue;
    const reasons: string[] = [];
    if (input.dismissed) {
      reasons.push('firstDismissed session, commun aux deux modes');
    }
    if (!input.dialogueReady) reasons.push('verrou socialListReady');
    if (input.matchesReady === false) reasons.push('snapshot matchs absent');
    if (reasons.length === 0) reasons.push('exclu du tri');
    exclusions.push({ id, reason: reasons.join(' ; ') });
  }
  const quietCount = input.quietIds.filter(Boolean).length;
  let stop: FirstWordChainStop;
  if (quietCount === 0) stop = 'aucun-match';
  else if (input.dismissed) stop = 'fermee-session';
  else if (!input.dialogueReady) stop = 'verrou-dialogue';
  else if (input.matchesReady === false) stop = 'snapshot-matchs';
  else if (!simplified.showFirstWord && detailed.showFirstWord) {
    stop = 'tri-qui-a-ecrit';
  } else stop = 'affiche';
  return {
    stop,
    simplifiedEligible: split.firstWordIds.length + split.followUpIds.length,
    detailedEligible: detailed.firstWordIds.length,
    simplifiedShow: simplified.showFirstWord,
    detailedShow: detailed.showFirstWord,
    hidesDetailedToo: input.dismissed && quietCount > 0,
    exclusions,
  };
}

export function followUpNotificationCopy(names: string[]): {
  title: string;
  body: string;
} {
  return {
    title: t('notifications.digestFollowTitle'),
    body: bodyWithNames(
      names,
      (list) => t('notifications.digestFollowOne', { names: list }),
      (list) => t('notifications.digestFollowMany', { names: list }),
      t('notifications.digestFollowEmpty')
    ),
  };
}

export function firstExchangeNotificationCopy(
  names: string[],
  tone: FirstDigestTone = 'write'
): {
  title: string;
  body: string;
} {
  if (tone === 'reply') {
    return {
      title: t('notifications.digestFirstWordTitle'),
      body: bodyWithNames(
        names,
        (list) => t('notifications.digestFirstReplyOne', { names: list }),
        (list) => t('notifications.digestFirstReplyMany', { names: list }),
        t('notifications.digestFirstReplyEmpty')
      ),
    };
  }
  if (tone === 'mixed') {
    return {
      title: t('notifications.digestFirstWordTitle'),
      body: bodyWithNames(
        names,
        (list) => t('notifications.digestFirstMixedOne', { names: list }),
        (list) => t('notifications.digestFirstMixedMany', { names: list }),
        t('notifications.digestFirstMixedEmpty')
      ),
    };
  }
  return {
    title: t('notifications.digestFirstWordTitle'),
    body: bodyWithNames(
      names,
      (list) => t('notifications.digestFirstWriteOne', { names: list }),
      (list) => t('notifications.digestFirstWriteMany', { names: list }),
      t('notifications.digestFirstWriteEmpty')
    ),
  };
}
