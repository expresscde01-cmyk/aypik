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
