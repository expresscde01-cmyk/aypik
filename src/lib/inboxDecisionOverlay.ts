/** Décisions RPC déjà réussies, en attendant que SELECT / cache likes les voient. */

export type OverlayInboxDecision = 'wait' | 'refuse' | 'match';
export type OverlayInboxOrigin = 'flash' | 'like';

export type OverlayInboxRow = {
  actor_id: string;
  decision: OverlayInboxDecision;
  origin: OverlayInboxOrigin;
  updated_at: string;
  wait_started_at: string | null;
};

const confirmed = new Map<
  string,
  { decision: OverlayInboxDecision; origin: OverlayInboxOrigin }
>();

export function rememberConfirmedInboxDecision(
  actorId: string,
  decision: OverlayInboxDecision,
  origin: OverlayInboxOrigin = 'like'
) {
  if (!actorId) return;
  confirmed.set(actorId, { decision, origin });
}

export function hasConfirmedInboxDecisions(): boolean {
  return confirmed.size > 0;
}

export function resetConfirmedInboxDecisions() {
  confirmed.clear();
}

/** Superpose les décisions confirmées sur le snapshot serveur (éventuellement en retard). */
export function mergeConfirmedInboxDecisions<T extends OverlayInboxRow>(
  rows: T[]
): T[] {
  if (confirmed.size === 0) return rows;
  const byActor = new Map(rows.map((row) => [row.actor_id, row]));
  const now = new Date().toISOString();
  for (const [actorId, known] of confirmed) {
    const existing = byActor.get(actorId);
    if (existing) {
      byActor.set(actorId, { ...existing, decision: known.decision });
    } else {
      byActor.set(actorId, {
        actor_id: actorId,
        decision: known.decision,
        origin: known.origin,
        updated_at: now,
        wait_started_at: known.decision === 'wait' ? now : null,
      } as T);
    }
  }
  return [...byActor.values()];
}

/** Retire l’overlay dès que le snapshot serveur porte la même décision. */
export function dropConfirmedInboxDecisionsSeenIn(
  rows: { actor_id: string; decision: string }[]
) {
  if (confirmed.size === 0) return;
  const byActor = new Map(rows.map((row) => [row.actor_id, row.decision]));
  for (const [actorId, known] of confirmed) {
    if (byActor.get(actorId) === known.decision) confirmed.delete(actorId);
  }
}
