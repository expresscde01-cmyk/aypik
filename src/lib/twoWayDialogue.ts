/** Vrai s’il existe au moins un message de chaque participant (pas un simple total ≥ 2). */
export function hasTwoWayDialogue(
  messages: Iterable<{ sender_id: string }>,
  userId: string,
  peerId: string
): boolean {
  if (!userId || !peerId || userId === peerId) return false;
  let mine = false;
  let theirs = false;
  for (const row of messages) {
    if (row.sender_id === userId) mine = true;
    else if (row.sender_id === peerId) theirs = true;
    if (mine && theirs) return true;
  }
  return false;
}

export type PeerDialogueFlagRow = {
  peer_id?: string | null;
  two_way?: boolean | null;
  wrote_to_me?: boolean | null;
  last_sent_at?: string | null;
};

export function parseLastSentAtMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export function peerSetsFromDialogueFlagRows(
  rows: PeerDialogueFlagRow[]
): {
  twoWay: Set<string>;
  wroteToMe: Set<string>;
  wroteFromMe: Set<string>;
  lastSentAt: Record<string, number>;
} {
  const twoWay = new Set<string>();
  const wroteToMe = new Set<string>();
  const wroteFromMe = new Set<string>();
  const lastSentAt: Record<string, number> = {};
  for (const row of rows) {
    const peer = row.peer_id;
    if (!peer) continue;
    if (row.two_way) twoWay.add(peer);
    if (row.wrote_to_me) wroteToMe.add(peer);
    // La RPC ne renvoie que des conversations avec au moins un message :
    // s’ils ne m’ont pas écrit, c’est moi qui ai écrit.
    if (row.two_way || !row.wrote_to_me) wroteFromMe.add(peer);
    const sentMs = parseLastSentAtMs(row.last_sent_at);
    if (sentMs != null) lastSentAt[peer] = sentMs;
  }
  return { twoWay, wroteToMe, wroteFromMe, lastSentAt };
}

/** Erreur Supabase : échec. Liste vide sans erreur : personne n’a écrit. */
export function peerDialogueFlagsFromRpc(
  error: unknown,
  rows: PeerDialogueFlagRow[] | null | undefined
): ReturnType<typeof peerSetsFromDialogueFlagRows> {
  if (error) throw error;
  return peerSetsFromDialogueFlagRows(rows ?? []);
}

export function peersWithTwoWayDialogueFromRows(
  rows: { sender_id?: string; recipient_id?: string }[],
  me: string
): Set<string> {
  const sendersByPeer = new Map<string, Set<string>>();
  for (const row of rows) {
    const sender = row.sender_id;
    const recipient = row.recipient_id;
    if (!sender || !recipient) continue;
    const peer = sender === me ? recipient : recipient === me ? sender : null;
    if (!peer || peer === me) continue;
    let senders = sendersByPeer.get(peer);
    if (!senders) {
      senders = new Set();
      sendersByPeer.set(peer, senders);
    }
    senders.add(sender);
  }
  const twoWay = new Set<string>();
  for (const [peer, senders] of sendersByPeer) {
    if (senders.has(me) && senders.has(peer)) twoWay.add(peer);
  }
  return twoWay;
}
