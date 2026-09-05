/**
 * Copy sociale alignée sur le glossaire CGU :
 * Like, Flash, Match, Matché le, Match le — jamais « coup de cœur ».
 */
import { pickDeclinedEncouragement } from '@/lib/declinedEncouragements';

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

/** Carte Mes Matchs — Flash/Like reçu non encore tranché (à étudier). */
export function pendingToDecideLabel(
  origin: InteractionOrigin,
  iso: string
): string {
  return `${originHistoryLabel(origin, iso)} — à étudier`;
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

/** Carte Mes Matchs — match validé sans aucun message. */
export function matchedNoDialogueLabel(
  iso: string,
  role: MatchRole = 'accepted'
): string {
  return `${matchedHistoryLabel(iso, role)} — pas encore de dialogue`;
}

/** Carte Mes Matchs — match avec au moins un message de chaque côté. */
export function matchedWithDialogueLabel(
  iso: string,
  role: MatchRole = 'accepted'
): string {
  return `${matchedHistoryLabel(iso, role)} — Discussion en cours`;
}

export function matchDialogueChipLabel(hasTwoWay: boolean): string {
  return hasTwoWay ? 'Discussion en cours' : '1er mot';
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
  return name || 'Quelqu’un';
}

/** Descriptions du panneau cloche : ponctuation finale si elle manque (conserve ! et ?). */
export function withNotificationPeriod(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (/[.!?…]$/u.test(t)) return t;
  return `${t}.`;
}

export function messageReceivedNotification(name: string): {
  title: string;
  body: string;
} {
  const actor = name.trim() || 'Quelqu’un';
  return {
    title: 'Nouveau message',
    body: `${actor} t'a envoyé un message.`,
  };
}

function likeReceivedBody(actor: string): string {
  return `${actor} t'a envoyé un Like ❤️.`;
}

export function likeReceivedNotification(name: string): {
  title: string;
  body: string;
} {
  const actor = name.trim() || 'Quelqu’un';
  return {
    title: 'Nouveau Like',
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
  const actor = name.trim() || 'Quelqu’un';
  return {
    title: 'Nouveau Flash',
    body: `${actor} t'a envoyé un Flash ⚡.`,
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
        ? `${actor} a matché ton Flash ⚡.`
        : `${actor} a matché ton Like ❤️.`,
  };
}

/** L’autre a mis en attente notre Flash / Like — balle dans son camp. */
export function matchWaitingNotification(
  name: string,
  origin: InteractionOrigin = 'like'
): { title: string; body: string } {
  const actor = name.trim() || 'Quelqu’un';
  const label = origin === 'flash' ? 'Flash' : 'Like';
  return {
    title: 'En attente',
    body: `${actor} a mis ton ${label} en attente.`,
  };
}

/** Rappel notif pour celle/celui qui a choisi Attendre — un seul CTA, pas de doublon. */
export function matchWaitReminderNotification(
  actorName: string,
  _origin: InteractionOrigin = 'like'
): { title: string; body: string } {
  const prenom = (actorName.trim() || '').split(/\s+/)[0];
  const who = prenom || 'ce membre';
  return {
    title: 'En attente',
    body: `Ne laisse pas ${who} dans l'attente.`,
  };
}

export function matchWaitExpiryNotification(): {
  title: string;
  body: string;
} {
  return {
    title: 'Attente bientôt expirée',
    body: 'Tu as des profils en attente qui vont bientôt expirer, pense à les consulter.',
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
  const actor = name.trim() || 'Quelqu’un';
  const label = origin === 'flash' ? 'Flash' : 'Like';
  const encouragement = pickDeclinedEncouragement(
    seed?.trim() || `${actor}\0${label}`
  );
  return {
    title: 'Pas cette fois',
    body: `${actor} a décliné ton ${label}. ${encouragement}`,
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
    return when ? `Archivé le ${when}` : 'Archivé';
  }
  const label = origin === 'flash' ? 'Flash' : 'Like';
  return when
    ? `A décliné ton ${label} le ${when}`
    : `A décliné ton ${label}`;
}

/** Carte live « Mis en attente par l’autre ». */
export function waitingByOtherStatusLabel(
  origin: InteractionOrigin,
  at?: string | null
): string {
  const label = origin === 'flash' ? 'Flash' : 'Like';
  const when = at ? formatInteractionDate(at) : '';
  return when
    ? `A mis ton ${label} en attente le ${when}`
    : `A mis ton ${label} en attente`;
}

/** Carte jaune archivée dans « Mis en attente ». */
export function waitArchiveStatusLabel(
  origin: InteractionOrigin,
  archivedAt?: string | null,
  source: 'mine' | 'theirs' = 'mine'
): string {
  const when = archivedAt ? formatInteractionDate(archivedAt) : '';
  if (source === 'theirs') {
    const label = origin === 'flash' ? 'Flash' : 'Like';
    return when
      ? `A mis ton ${label} en attente — archivé le ${when}`
      : `A mis ton ${label} en attente — archivé`;
  }
  return when ? `Archivé le ${when}` : 'Archivé';
}

/** Carte « Matchs rompus ». */
export function brokenMatchStatusLabel(
  action: 'archive' | 'break',
  at?: string | null
): string {
  const when = at ? formatInteractionDate(at) : '';
  if (action === 'archive') {
    return when ? `Archivé le ${when}` : 'Match archivé';
  }
  return when ? `Match rompu le ${when}` : 'Match rompu';
}

/** Origine d’une fiche « Matchs rompus » (avant rupture) : échange des deux côtés. */
export function brokenMatchOriginLabel(hadDialogue: boolean): string {
  return hadDialogue
    ? "Provenait d'une discussion en cours"
    : "Provenait d'un 1er mot";
}

/** Rappel local (fiche / Mes Matchs) pour celle/celui qui a choisi Attendre. */
export function waitingMatchReminder(
  origin: InteractionOrigin,
  viewerGender?: 'homme' | 'femme' | null
): string {
  const kind = origin === 'flash' ? 'Flash' : 'Like';
  const ready = viewerGender === 'femme' ? 'prête' : 'prêt';
  return `Tu as mis ce ${kind} en attente : matche, archive ou refuse quand tu seras ${ready}.`;
}

/** Après un refus (sens interdit) : suite Jeter / Archiver. */
export function refusedInboxFollowup(origin: InteractionOrigin): string {
  const kind = origin === 'flash' ? 'Flash' : 'Like';
  return `Tu as refusé ce ${kind}. Tu peux maintenant le jeter ou l'archiver.`;
}

/** @deprecated Préférer waitingMatchReminder(origin, gender). */
export const WAITING_MATCH_REMINDER = waitingMatchReminder('like', null);

/** Nous avons validé leur Flash / Like (rôle accepted). */
export function matchAcceptedByUsNotification(
  name: string,
  origin: InteractionOrigin = 'like'
): { title: string; body: string } {
  const actor = name.trim() || 'Quelqu’un';
  const label = origin === 'flash' ? 'Flash' : 'Like';
  const text = `Tu as validé le ${label} de ${actor} : match confirmé (la messagerie est ouverte).`;
  return {
    title: 'Match confirmé',
    body: text,
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
