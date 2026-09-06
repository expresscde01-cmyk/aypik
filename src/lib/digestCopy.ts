function firstNameOf(name?: string | null): string | null {
  const token = (name || '').trim().split(/\s+/)[0];
  return token ? token : null;
}

export function digestFirstName(name?: string | null): string {
  return firstNameOf(name) || 'Quelqu’un';
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
  if (n === 2) return `${cleaned[0]} et ${cleaned[1]}`;
  if (n === 3) return `${cleaned[0]}, ${cleaned[1]} et ${cleaned[2]}`;
  if (n === 4) {
    return `${cleaned[0]}, ${cleaned[1]}, ${cleaned[2]} et ${cleaned[3]}`;
  }
  const rest = n - 2;
  return `${cleaned[0]}, ${cleaned[1]} et ${rest} autre${rest > 1 ? 's' : ''}`;
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
    title: 'À découvrir',
    body: bodyWithNames(
      names,
      (list) =>
        `Tu as le profil de ${list} à étudier. Prends un moment pour le découvrir.`,
      (list) =>
        `Tu as les profils de ${list} à étudier. Prends un moment pour les découvrir.`,
      `Tu as des profils à étudier. Prends un moment pour les découvrir.`
    ),
  };
}

export function waitingProfilesNotificationCopy(names: string[]): {
  title: string;
  body: string;
} {
  return {
    title: 'En attente',
    body: bodyWithNames(
      names,
      (list) => `Ne laisse pas ${list} dans l'attente.`,
      (list) => `Ne laisse pas ${list} dans l'attente.`,
      `Ne laisse pas ces membres dans l'attente.`
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
      title: '1er mot',
      body: bodyWithNames(
        names,
        (list) =>
          `Pense à répondre à ${list} pour lancer la conversation.`,
        (list) =>
          `Pense à répondre à ${list} pour lancer les conversations.`,
        `Pense à répondre pour lancer la conversation.`
      ),
    };
  }
  if (tone === 'mixed') {
    return {
      title: '1er mot',
      body: bodyWithNames(
        names,
        (list) =>
          `Pense à écrire ou à répondre à ${list} pour lancer la conversation.`,
        (list) =>
          `Pense à écrire ou à répondre à ${list} pour lancer les conversations.`,
        `Pense à écrire ou à répondre pour lancer la conversation.`
      ),
    };
  }
  return {
    title: '1er mot',
    body: bodyWithNames(
      names,
      (list) =>
        `Pense à écrire le 1er mot à ${list} pour lancer la conversation.`,
      (list) =>
        `Pense à écrire les 1ers mots à ${list} pour lancer les conversations.`,
      `Pense à écrire le 1er mot pour lancer la conversation.`
    ),
  };
}
