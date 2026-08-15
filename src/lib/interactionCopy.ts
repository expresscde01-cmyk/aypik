/**
 * Copy sociale alignée sur le glossaire CGU :
 * Like, Flash, Match, Matché le, Match le — jamais « coup de cœur ».
 */
export type InteractionOrigin = 'like' | 'flash';

function parseDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date d’interaction : « 14 août 2026 ». */
export function formatInteractionDate(iso: string): string {
  const d = parseDate(iso);
  if (!d) return '';
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Date de match CGU : « vendredi 14 août 2026 ». */
export function formatMatchCalendarDate(iso: string): string {
  const d = parseDate(iso);
  if (!d) return '';
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function originHistoryLabel(
  origin: InteractionOrigin,
  iso: string
): string {
  const date = formatInteractionDate(iso);
  if (origin === 'flash') {
    return date ? `Flash du ${date} ⚡` : 'Flash ⚡';
  }
  return date ? `Like du ${date} ❤️` : 'Like ❤️';
}

/**
 * initiated = notre Like/Flash a été accepté (CGU « Match le »)
 * accepted  = nous avons répondu à leur intérêt (CGU « Matché le »)
 */
export type MatchRole = 'accepted' | 'initiated';

export function matchRoleFromDates(
  myFirstAt: string | null | undefined,
  theirFirstAt: string | null | undefined
): MatchRole {
  const mine = myFirstAt ? Date.parse(myFirstAt) : NaN;
  const theirs = theirFirstAt ? Date.parse(theirFirstAt) : NaN;
  if (Number.isFinite(mine) && Number.isFinite(theirs) && mine < theirs) {
    return 'initiated';
  }
  return 'accepted';
}

/** Historique profil — glossaire CGU Match le / Matché le. */
export function matchedHistoryLabel(
  iso: string,
  role: MatchRole = 'accepted'
): string {
  const date = formatMatchCalendarDate(iso);
  if (role === 'initiated') {
    return date ? `Match le ${date}` : 'Match';
  }
  return date ? `Matché le ${date}` : 'Matché';
}

function senderNameFromBody(body: string): string {
  const match = body.match(
    /^(.+?)\s+(?:t['’]a\s|a matché|a liké|a accepté)/i
  );
  const name = match?.[1]?.trim();
  return name || 'Quelqu’un';
}

export function messageReceivedNotification(name: string): {
  title: string;
  body: string;
} {
  const actor = name.trim() || 'Quelqu’un';
  return {
    title: 'Nouveau message',
    body: `${actor} t'a envoyé un message`,
  };
}

export function likeReceivedNotification(name: string): {
  title: string;
  body: string;
} {
  const actor = name.trim() || 'Quelqu’un';
  return {
    title: 'Nouveau Like',
    body: `${actor} t'a envoyé un Like ❤️`,
  };
}

export function flashReceivedNotification(name: string): {
  title: string;
  body: string;
} {
  const actor = name.trim() || 'Quelqu’un';
  return {
    title: 'Nouveau Flash',
    body: `${actor} t'a envoyé un Flash ⚡`,
  };
}

/** Autre personne a accepté notre Like / Flash (rôle initiated). */
export function matchCreatedNotification(
  name: string,
  origin: InteractionOrigin
): { title: string; body: string } {
  const actor = name.trim() || 'Quelqu’un';
  return {
    title: 'C’est un match !',
    body:
      origin === 'flash'
        ? `${actor} a matché ton Flash ⚡`
        : `${actor} a matché ton Like ❤️`,
  };
}

/** Nous avons validé leur intérêt (rôle accepted) — CGU « Matché le ». */
export function matchAcceptedByUsNotification(iso?: string | null): {
  title: string;
  body: string;
} {
  const date = iso ? formatMatchCalendarDate(iso) : '';
  const label = date ? `Matché le ${date}` : 'Matché';
  return {
    title: label,
    body: 'Tu as confirmé un intérêt mutuel. La messagerie est ouverte.',
  };
}

export type SocialCopyInput = {
  kind: string;
  title: string;
  body: string;
  flash_id?: string | null;
  created_at?: string | null;
  action_type?: string | null;
  interaction_type?: string | null;
  source?: string | null;
  origin?: string | null;
  /** initiated = ils ont répondu à nous ; accepted = nous avons validé */
  match_role?: MatchRole | string | null;
};

function normalizeOriginToken(
  value: string | null | undefined
): InteractionOrigin | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === 'flash' || v === 'flashes') return 'flash';
  if (v === 'like' || v === 'likes' || v === 'like_received') return 'like';
  return null;
}

function normalizeMatchRole(
  value: string | null | undefined
): MatchRole | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === 'initiated' || v === 'initiator' || v === 'match_le') {
    return 'initiated';
  }
  if (v === 'accepted' || v === 'acceptor' || v === 'matche_le') {
    return 'accepted';
  }
  return null;
}

/** Origine Flash vs Like (flash_id, source, libellé stocké). */
export function resolveMatchOrigin(n: SocialCopyInput): InteractionOrigin {
  const explicit =
    normalizeOriginToken(n.origin) ||
    normalizeOriginToken(n.action_type) ||
    normalizeOriginToken(n.interaction_type) ||
    normalizeOriginToken(n.source);
  if (explicit) return explicit;

  if (n.flash_id) return 'flash';

  const blob = `${n.title} ${n.body}`;
  if (/flash/i.test(blob) || /a matché ton Flash/i.test(n.body)) {
    return 'flash';
  }
  if (
    /a matché ton Like/i.test(n.body) ||
    /a liké en retour/i.test(n.body) ||
    /\blike\b/i.test(blob)
  ) {
    return 'like';
  }

  return 'like';
}

/**
 * Qui a initié / qui a validé, selon le glossaire CGU.
 * - initiated : l’autre a répondu à notre Like/Flash → « a matché ton… »
 * - accepted  : nous avons validé → « Matché le [date] »
 */
export function resolveMatchNotificationRole(
  n: SocialCopyInput
): MatchRole {
  const explicit = normalizeMatchRole(n.match_role);
  if (explicit) return explicit;

  if (/a matché ton (Flash|Like)/i.test(n.body)) {
    return 'initiated';
  }

  if (
    /^matché le\b/i.test(n.title.trim()) ||
    /^matché le\b/i.test(n.body.trim()) ||
    /^(.+?)\s+a matché\.?\s*$/i.test(n.body.trim())
  ) {
    return 'accepted';
  }

  // flash_id renseigné sur notif « ton Flash » côté émetteur
  if (n.flash_id && /a matché ton/i.test(n.body)) {
    return 'initiated';
  }

  if (n.flash_id) return 'initiated';

  return 'accepted';
}

/** Cloche : vocabulaire CGU uniquement. */
export function displaySocialNotification(n: SocialCopyInput): {
  title: string;
  body: string;
} {
  const name = senderNameFromBody(n.body);
  const leftoverCoeur = /coup de c[œe]ur/i.test(`${n.title} ${n.body}`);

  if (n.kind === 'message_received') {
    return messageReceivedNotification(name);
  }

  if (n.kind === 'flash_received') {
    return flashReceivedNotification(name);
  }

  if (n.kind === 'match_created') {
    const origin = resolveMatchOrigin(n);
    const role = resolveMatchNotificationRole(n);

    if (role === 'initiated') {
      return matchCreatedNotification(name, origin);
    }

    return matchAcceptedByUsNotification(n.created_at);
  }

  if (n.kind === 'like_received' || leftoverCoeur) {
    return likeReceivedNotification(name);
  }

  return {
    title: n.title.replace(/coup de c[œe]ur/gi, 'Like'),
    body: n.body
      .replace(/coup de c[œe]ur/gi, 'Like')
      .replace(/\s*[—–-]\s*tu peux discuter\.?/gi, ''),
  };
}
