/** Masquage suggestions : refus inbox de moins de 3 mois (les deux sens). SQL = source. */

export const SUGGEST_REFUSE_HIDE_MONTHS = 3;

export function recentInboxRefuseHidesSuggestion(
  updatedAtIso: string | null | undefined,
  now = new Date()
): boolean {
  if (!updatedAtIso) return false;
  const at = Date.parse(updatedAtIso);
  if (!Number.isFinite(at)) return false;
  const limit = new Date(now.getTime());
  limit.setMonth(limit.getMonth() - SUGGEST_REFUSE_HIDE_MONTHS);
  return at >= limit.getTime();
}

/** Pair masqué pour le viewer, ou null si la ligne n’est pas un refus le concernant. */
export function refuseHiddenPeerId(
  row: { user_id: string; actor_id: string; decision: string },
  viewerId: string
): string | null {
  if (row.decision !== 'refuse' || !viewerId) return null;
  if (row.user_id === viewerId) return row.actor_id;
  if (row.actor_id === viewerId) return row.user_id;
  return null;
}
