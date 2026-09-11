/**
 * Copy sociale alignée sur le glossaire CGU :
 * Like, Flash, Match, Matché le, Match le — jamais « coup de cœur ».
 */
import { pickDeclinedEncouragement } from '@/lib/declinedEncouragements';
import { formatDateLong, formatDateWeekdayLong } from '../i18n/format.ts';
import { t } from '../i18n/t.ts';

export type InteractionOrigin = 'like' | 'flash';

function someone(): string {
  return t('common.someone');
}

function originKind(origin: InteractionOrigin): string {
  return origin === 'flash' ? 'Flash' : 'Like';
}

/** Date d’interaction : « 14 août 2026 ». */
export function formatInteractionDate(iso: string): string {
  return formatDateLong(iso);
}

/** Date de match CGU : « vendredi 14 août 2026 ». */
export function formatMatchCalendarDate(iso: string): string {
  return formatDateWeekdayLong(iso);
}

export function originHistoryLabel(
  origin: InteractionOrigin,
  iso: string
): string {
  const date = formatInteractionDate(iso);
  if (origin === 'flash') {
    return date ? t('matches.flashOfDate', { date }) : t('matches.flashOnly');
  }
  return date ? t('matches.likeOfDate', { date }) : t('matches.likeOnly');
}

/** Carte Mes Matchs — Flash/Like reçu non encore tranché (à étudier). */
export function pendingToDecideLabel(
  origin: InteractionOrigin,
  iso: string
): string {
  return t('matches.pendingToDecide', {
    history: originHistoryLabel(origin, iso),
  });
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
    return date ? t('matches.matchLe', { date }) : 'Match';
  }
  return date ? t('matches.matcheLe', { date }) : 'Matché';
}

/** Carte Mes Matchs — match validé sans aucun message. */
export function matchedNoDialogueLabel(
  iso: string,
  role: MatchRole = 'accepted'
): string {
  return t('matches.matchedNoDialogue', {
    history: matchedHistoryLabel(iso, role),
  });
}

/** Carte Mes Matchs — match avec au moins un message de chaque côté. */
export function matchedWithDialogueLabel(
  iso: string,
  role: MatchRole = 'accepted'
): string {
  return t('matches.matchedWithDialogue', {
    history: matchedHistoryLabel(iso, role),
  });
}

export function matchDialogueChipLabel(hasTwoWay: boolean): string {
  return hasTwoWay ? t('matches.chipDiscussionCap') : t('matches.chipFirstWord');
}

function senderNameFromBody(body: string): string {
  const waiting = body.match(/^(.+?)\s+a mis ton\s+/i);
  if (waiting?.[1]?.trim()) return waiting[1].trim();

  const legacyWait = body.match(/^En attente par\s+(.+?)\s*$/i);
  if (legacyWait?.[1]?.trim()) return legacyWait[1].trim();

  const reminder = body.match(
    /Pense à valider ou à refuser le (?:Flash|Like)\s+(?:d'|de\s+)(.+?)\s*$/i
  );
  if (reminder?.[1]?.trim()) return reminder[1].trim();

  const match = body.match(
    /^(.+?)\s+(?:t['’]a\s|a matché|a liké|a accepté|a décliné)/i
  );
  const name = match?.[1]?.trim();
  return name || someone();
}

/** Descriptions du panneau cloche : ponctuation finale si elle manque (conserve ! et ?). */
export function withNotificationPeriod(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/[.!?…]$/u.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

export function messageReceivedNotification(name: string): {
  title: string;
  body: string;
} {
  const actor = name.trim() || someone();
  return {
    title: t('notifications.newMessageTitle'),
    body: t('notifications.newMessageBody', { name: actor }),
  };
}

function likeReceivedBody(actor: string): string {
  return t('notifications.newLikeBody', { name: actor });
}

export function likeReceivedNotification(name: string): {
  title: string;
  body: string;
} {
  const actor = name.trim() || someone();
  return {
    title: t('notifications.newLikeTitle'),
    body: likeReceivedBody(actor),
  };
}

/** Marque du body « Nouveau Like », extraite du texte canonique (pas un autre cœur). */
export const LIKE_NOTIFICATION_EMOJI = (() => {
  const body = likeReceivedBody('OK5');
  const afterLike = body.lastIndexOf('Like ') + 'Like '.length;
  return body.slice(afterLike, -1);
})();

export function flashReceivedNotification(name: string): {
  title: string;
  body: string;
} {
  const actor = name.trim() || someone();
  return {
    title: t('notifications.newFlashTitle'),
    body: t('notifications.newFlashBody', { name: actor }),
  };
}

/** Autre personne a accepté notre Like / Flash (rôle initiated). */
export function matchCreatedNotification(
  name: string,
  origin: InteractionOrigin
): { title: string; body: string } {
  const actor = name.trim() || someone();
  return {
    title: t('notifications.matchCreatedTitle'),
    body:
      origin === 'flash'
        ? t('notifications.matchCreatedFlash', { name: actor })
        : t('notifications.matchCreatedLike', { name: actor }),
  };
}

/** L’autre a mis en attente notre Flash / Like — balle dans son camp. */
export function matchWaitingNotification(
  name: string,
  origin: InteractionOrigin = 'like'
): { title: string; body: string } {
  const actor = name.trim() || someone();
  const label = originKind(origin);
  return {
    title: t('notifications.waitingTitle'),
    body: t('notifications.waitingBody', { name: actor, label }),
  };
}

/** Rappel notif pour celle/celui qui a choisi Attendre — un seul CTA, pas de doublon. */
export function matchWaitReminderNotification(
  actorName: string,
  _origin: InteractionOrigin = 'like'
): { title: string; body: string } {
  const prenom = (actorName.trim() || '').split(/\s+/)[0];
  const who = prenom || t('common.thisMember');
  return {
    title: t('notifications.waitingTitle'),
    body: t('notifications.waitReminderBody', { name: who }),
  };
}

export function matchWaitExpiryNotification(): {
  title: string;
  body: string;
} {
  return {
    title: t('notifications.waitExpiryTitle'),
    body: t('notifications.waitExpiryBody'),
  };
}

export function matchDeclinedNotification(
  name: string,
  origin: InteractionOrigin = 'like',
  seed?: string | null
): {
  title: string;
  body: string;
} {
  const actor = name.trim() || someone();
  const label = originKind(origin);
  const encouragement = pickDeclinedEncouragement(
    seed?.trim() || `${actor}\0${label}`
  );
  return {
    title: t('notifications.declinedTitle'),
    body: t('notifications.declinedBody', {
      name: actor,
      label,
      encouragement,
    }),
  };
}

/** Fiche mauve archivée en bas de Mes Matchs. */
export function declinedArchiveStatusLabel(
  origin: InteractionOrigin,
  declinedAt?: string | null,
  source: 'theirs' | 'mine' = 'theirs'
): string {
  const when = declinedAt ? formatInteractionDate(declinedAt) : '';
  if (source === 'mine') {
    return when ? t('matches.archivedOn', { date: when }) : t('matches.archived');
  }
  const label = originKind(origin);
  return when
    ? t('matches.declinedYourOn', { label, date: when })
    : t('matches.declinedYour', { label });
}

/** Carte live « Mis en attente par l’autre ». */
export function waitingByOtherStatusLabel(
  origin: InteractionOrigin,
  at?: string | null
): string {
  const label = originKind(origin);
  const when = at ? formatInteractionDate(at) : '';
  return when
    ? t('matches.waitingYourOn', { label, date: when })
    : t('matches.waitingYour', { label });
}

/** Carte jaune archivée dans « Mis en attente ». */
export function waitArchiveStatusLabel(
  origin: InteractionOrigin,
  archivedAt?: string | null,
  source: 'mine' | 'theirs' = 'mine'
): string {
  const when = archivedAt ? formatInteractionDate(archivedAt) : '';
  if (source === 'theirs') {
    const label = originKind(origin);
    return when
      ? t('matches.waitArchiveTheirsOn', { label, date: when })
      : t('matches.waitArchiveTheirs', { label });
  }
  return when ? t('matches.archivedOn', { date: when }) : t('matches.archived');
}

/** Carte « Matchs rompus ». */
export function brokenMatchStatusLabel(
  action: 'archive' | 'break',
  at?: string | null
): string {
  const when = at ? formatInteractionDate(at) : '';
  if (action === 'archive') {
    return when
      ? t('matches.archivedOn', { date: when })
      : t('matches.matchArchived');
  }
  return when
    ? t('matches.matchBrokenOn', { date: when })
    : t('matches.matchBrokenStatus');
}

/** Origine d’une fiche « Matchs rompus » (avant rupture) : échange des deux côtés. */
export function brokenMatchOriginLabel(hadDialogue: boolean): string {
  return hadDialogue
    ? t('matches.brokenFromDiscussion')
    : t('matches.brokenFromFirstWord');
}

/** Rappel local (fiche / Mes Matchs) pour celle/celui qui a choisi Attendre. */
export function waitingMatchReminder(
  origin: InteractionOrigin,
  viewerGender?: 'homme' | 'femme' | null
): string {
  const kind = originKind(origin);
  const ready =
    viewerGender === 'femme' ? t('common.readyFemale') : t('common.readyMale');
  return t('matches.waitingReminder', { label: kind, ready });
}

/** Après un refus (sens interdit) : suite Jeter / Archiver. */
export function refusedInboxFollowup(origin: InteractionOrigin): string {
  return t('matches.refusedFollowup', { label: originKind(origin) });
}

/** @deprecated Préférer waitingMatchReminder(origin, gender). */
export function waitingMatchReminderLike(): string {
  return waitingMatchReminder('like', null);
}

/** Nous avons validé leur Flash / Like (rôle accepted). */
export function matchAcceptedByUsNotification(
  name: string,
  origin: InteractionOrigin = 'like'
): { title: string; body: string } {
  const actor = name.trim() || someone();
  const label = originKind(origin);
  return {
    title: t('notifications.matchAcceptedTitle'),
    body: t('notifications.matchAcceptedBody', { label, name: actor }),
  };
}

export type SocialCopyInput = {
  id?: string | null;
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
  /** Prénom / display_name de l’acteur (si connu hors body). */
  actor_name?: string | null;
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
    /^(.+?)\s+a matché\.?\s*$/i.test(n.body.trim()) ||
    /Tu as validé (un|le) (Flash|Like)/i.test(n.body) ||
    /Tu as confirmé un intérêt/i.test(n.body)
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
  const nameFromBody = senderNameFromBody(n.body);
  const name =
    (n.actor_name && n.actor_name.trim()) || nameFromBody;
  const leftoverCoeur = /coup de c[œe]ur/i.test(`${n.title} ${n.body}`);

  if (n.kind === 'message_received') {
    return withPeriod(messageReceivedNotification(name));
  }

  if (n.kind === 'flash_received') {
    return withPeriod(flashReceivedNotification(name));
  }

  if (n.kind === 'match_created') {
    const origin = resolveMatchOrigin(n);
    const role = resolveMatchNotificationRole(n);

    if (role === 'initiated') {
      return withPeriod(matchCreatedNotification(name, origin));
    }

    return withPeriod(matchAcceptedByUsNotification(name, origin));
  }

  if (n.kind === 'match_waiting') {
    const origin =
      /Flash/i.test(n.body) || resolveMatchOrigin(n) === 'flash'
        ? 'flash'
        : 'like';
    return withPeriod(matchWaitingNotification(name, origin));
  }

  if (n.kind === 'match_wait_reminder') {
    return withPeriod(matchWaitReminderNotification(name));
  }

  if (n.kind === 'match_wait_expiry') {
    return withPeriod(matchWaitExpiryNotification());
  }

  if (n.kind === 'match_declined') {
    const origin =
      /Flash/i.test(n.body) || resolveMatchOrigin(n) === 'flash'
        ? 'flash'
        : 'like';
    return withPeriod(
      matchDeclinedNotification(name, origin, n.id || n.created_at)
    );
  }

  if (n.kind === 'like_received' || leftoverCoeur) {
    return withPeriod(likeReceivedNotification(name));
  }

  return withPeriod({
    title: n.title.replace(/coup de c[œe]ur/gi, 'Like'),
    body: n.body
      .replace(/coup de c[œe]ur/gi, 'Like')
      .replace(/\s*[—–-]\s*tu peux discuter\.?/gi, ''),
  });
}

function withPeriod(copy: { title: string; body: string }): {
  title: string;
  body: string;
} {
  return { title: copy.title, body: withNotificationPeriod(copy.body) };
}
