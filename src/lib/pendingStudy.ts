import { supabase } from '@/lib/supabase';
import { fetchInboxResponses } from '@/lib/inboxResponses';

export type MatchPulseCategory = 'new' | 'wait' | 'first';
export type InteractionOriginLabel = 'like' | 'flash';

export type SoleNewProfile = {
  id: string;
  displayName: string;
  origin: InteractionOriginLabel;
};

export type InboxCategoryCounts = {
  /** Catégorie A — Like/Flash reçus pas encore tranchés. */
  newCount: number;
  /** Catégorie B — mis en attente manuellement. */
  waitCount: number;
  /** Renseigné uniquement si newCount === 1. */
  soleNew?: SoleNewProfile | null;
  /** Renseigné uniquement si waitCount === 1. */
  soleWait?: SoleNewProfile | null;
  /**
   * Profils déjà résolus côté inbox (match validé, like renvoyé, ou refus).
   * Sert de garde-fou pour masquer « À découvrir » / Flash / Like obsolètes.
   */
  resolvedActorIds: string[];
};

/**
 * Compte les profils Nouveaux (A) et En attente (B) pour les notifs de connexion.
 * Un profil déjà matché (like renvoyé) ou refusé n’apparaît JAMAIS en « À découvrir ».
 */
export async function countInboxCategories(
  userId: string
): Promise<InboxCategoryCounts> {
  const [sentRes, receivedRes, flashRes, inboxRes] = await Promise.all([
    supabase.from('likes').select('to_user').eq('from_user', userId),
    supabase.from('likes').select('from_user').eq('to_user', userId),
    supabase.from('flashes').select('from_user').eq('to_user', userId),
    fetchInboxResponses().catch(() => []),
  ]);

  if (sentRes.error) throw sentRes.error;
  if (receivedRes.error) throw receivedRes.error;
  if (flashRes.error) throw flashRes.error;

  const sentSet = new Set((sentRes.data || []).map((l) => l.to_user));
  const flashSet = new Set((flashRes.data || []).map((f) => f.from_user));
  const likeSet = new Set((receivedRes.data || []).map((l) => l.from_user));
  const waiting = new Set(
    (inboxRes || [])
      .filter((r) => r.decision === 'wait')
      .map((r) => r.actor_id)
  );
  const refused = new Set(
    (inboxRes || [])
      .filter((r) => r.decision === 'refuse')
      .map((r) => r.actor_id)
  );
  const matchedDecision = new Set(
    (inboxRes || [])
      .filter((r) => r.decision === 'match')
      .map((r) => r.actor_id)
  );

  const incoming = new Set<string>();
  for (const id of likeSet) incoming.add(id);
  for (const id of flashSet) incoming.add(id);

  // Résolu = like renvoyé (étage matchs) OU décision match/refuse en base
  const resolved = new Set<string>();
  for (const id of incoming) {
    if (sentSet.has(id) || matchedDecision.has(id) || refused.has(id)) {
      resolved.add(id);
    }
  }
  for (const id of sentSet) {
    if (likeSet.has(id) || flashSet.has(id)) resolved.add(id);
  }
  for (const id of matchedDecision) resolved.add(id);
  for (const id of refused) resolved.add(id);

  const newIds: string[] = [];
  const waitIds: string[] = [];
  for (const id of incoming) {
    if (resolved.has(id)) continue;
    if (waiting.has(id)) waitIds.push(id);
    else newIds.push(id);
  }

  const newCount = newIds.length;
  const waitCount = waitIds.length;
  let soleNew: SoleNewProfile | null = null;
  let soleWait: SoleNewProfile | null = null;

  const loadSole = async (
    id: string
  ): Promise<SoleNewProfile> => {
    const origin: InteractionOriginLabel = flashSet.has(id) ? 'flash' : 'like';
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', id)
      .maybeSingle();
    const displayName = String(
      (data as { display_name?: string | null } | null)?.display_name || ''
    ).trim();
    return {
      id,
      displayName: displayName || 'Quelqu’un',
      origin,
    };
  };

  if (newCount === 1) soleNew = await loadSole(newIds[0]);
  if (waitCount === 1) soleWait = await loadSole(waitIds[0]);

  return {
    newCount,
    waitCount,
    soleNew,
    soleWait,
    resolvedActorIds: [...resolved],
  };
}

/** @deprecated Préférer countInboxCategories */
export async function countPendingStudyProfiles(
  userId: string
): Promise<number> {
  const { newCount } = await countInboxCategories(userId);
  return newCount;
}

function firstNameOf(name?: string | null): string | null {
  const token = (name || '').trim().split(/\s+/)[0];
  return token ? token : null;
}

function studyRecapBody(count: number, soleName?: string | null): string {
  const n = Math.max(0, count);
  const prenom = n === 1 ? firstNameOf(soleName) : null;
  if (prenom) {
    return `Tu as le profil de ${prenom} ci-dessus à étudier. Prends un moment pour le découvrir.`;
  }
  if (n <= 1) {
    return `Tu as le profil ci-dessus à étudier. Prends un moment pour le découvrir.`;
  }
  return `Tu as ces ${n} profils ci-dessus à étudier. Prends un moment pour les découvrir.`;
}

export function newProfilesNotificationCopy(
  count: number,
  soleName?: string | null,
  _viewerGender?: 'homme' | 'femme' | null
): {
  title: string;
  body: string;
} {
  return {
    title: 'À découvrir',
    body: studyRecapBody(count, soleName),
  };
}

/** Flash/Like reçu + digest « À découvrir » fusionnés (même profil). */
export function mergedNewProfileNotificationCopy(
  displayName: string,
  origin: InteractionOriginLabel = 'like'
): {
  title: string;
  body: string;
} {
  const prenom = displayName.trim() || 'Quelqu’un';
  const label = origin === 'flash' ? 'Flash' : 'Like';
  return {
    title: 'À découvrir',
    body: `${prenom} t'a envoyé un ${label} et attend que tu le valides : prends le temps de le découvrir.`,
  };
}

export function waitingProfilesNotificationCopy(
  count: number,
  _viewerGender?: 'homme' | 'femme' | null,
  soleName?: string | null
): {
  title: string;
  body: string;
} {
  const n = Math.max(0, count);
  const prenom = n === 1 ? firstNameOf(soleName) : null;
  if (prenom) {
    return {
      title: 'En attente',
      body: `Ne laisse pas ${prenom} dans l'attente.`,
    };
  }
  if (n <= 1) {
    return {
      title: 'En attente',
      body: `Ne laisse pas ce membre dans l'attente.`,
    };
  }
  return {
    title: 'En attente',
    body: `Ne laisse pas ces membres dans l'attente.`,
  };
}

export function firstExchangeNotificationCopy(
  count: number,
  soleName?: string | null
): {
  title: string;
  body: string;
} {
  const n = Math.max(0, count);
  const prenom = n === 1 ? firstNameOf(soleName) : null;
  if (prenom) {
    return {
      title: '1er mot',
      body: `Pense à écrire le 1er mot à ${prenom} pour lancer la conversation.`,
    };
  }
  if (n <= 1) {
    return {
      title: '1er mot',
      body: `Pense à écrire le 1er mot pour lancer la conversation.`,
    };
  }
  return {
    title: '1er mot',
    body: `Pense à écrire les 1ers mots à ces ${n} personnes pour lancer les conversations.`,
  };
}

export function categoryNotifSessionKey(
  userId: string,
  category: MatchPulseCategory
): string {
  return `aypik-inbox-cat-${category}:${userId}`;
}

/** Une seule sonnerie de digest par onglet — pas à chaque F5. */
export function categoryRingSessionKey(userId: string): string {
  return `aypik-cat-ring:${userId}`;
}
