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
