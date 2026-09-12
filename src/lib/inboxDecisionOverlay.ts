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
  {
    decision: OverlayInboxDecision;
    origin: OverlayInboxOrigin;
    updated_at?: string;
  }
>();

export function rememberConfirmedInboxDecision(
  actorId: string,
  decision: OverlayInboxDecision,
  origin: OverlayInboxOrigin = 'like',
  updatedAt?: string | null
) {
  if (!actorId) return;
  confirmed.set(actorId, {
    decision,
    origin,
    updated_at: updatedAt || undefined,
  });
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
    const stamp = known.updated_at || now;
    if (existing) {
      byActor.set(actorId, {
        ...existing,
        decision: known.decision,
        updated_at:
          existing.decision === known.decision ? existing.updated_at : stamp,
      });
    } else {
      byActor.set(actorId, {
        actor_id: actorId,
        decision: known.decision,
        origin: known.origin,
        updated_at: stamp,
        wait_started_at: known.decision === 'wait' ? stamp : null,
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
