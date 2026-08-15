import { supabase } from '@/lib/supabase';
import { fetchInboxResponses } from '@/lib/inboxResponses';

export type MatchPulseCategory = 'new' | 'wait';
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
  let waitCount = 0;
  for (const id of incoming) {
    if (resolved.has(id)) continue;
    if (waiting.has(id)) waitCount += 1;
    else newIds.push(id);
  }

  const newCount = newIds.length;
  let soleNew: SoleNewProfile | null = null;

  if (newCount === 1) {
    const id = newIds[0];
    const origin: InteractionOriginLabel = flashSet.has(id) ? 'flash' : 'like';
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', id)
      .maybeSingle();
    const displayName = String(
      (data as { display_name?: string | null } | null)?.display_name || ''
    ).trim();
    soleNew = {
      id,
      displayName: displayName || 'Quelqu’un',
      origin,
    };
  }

  return {
    newCount,
    waitCount,
    soleNew,
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

export function newProfilesNotificationCopy(
  count: number,
  sole?: Pick<SoleNewProfile, 'displayName' | 'origin'> | null
): {
  title: string;
  body: string;
} {
  const n = Math.max(0, count);
  if (n === 1 && sole) {
    return mergedNewProfileNotificationCopy(sole.displayName, sole.origin);
  }
  return {
    title: 'À découvrir',
    body: `Tu as ${n} profils en attente d'être étudiés. Prends un moment pour les découvrir !`,
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

export function waitingProfilesNotificationCopy(count: number): {
  title: string;
  body: string;
} {
  const n = Math.max(0, count);
  const label =
    n <= 1
      ? 'Tu as 1 profil mis en attente.'
      : `Tu as ${n} profils mis en attente.`;
  return {
    title: 'En attente',
    body: `${label} Reviens trancher quand tu es prêt·e.`,
  };
}

export function categoryNotifSessionKey(
  userId: string,
  category: MatchPulseCategory
): string {
  return `aypik-inbox-cat-${category}:${userId}`;
}
