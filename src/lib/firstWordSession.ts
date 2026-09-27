/** Notification « 1er mot » masquée après une réponse, pour la session en cours. */

export const FIRST_WORD_REPLIED_EVENT = 'aypik-first-word-replied';

export function firstWordRepliedSessionKey(userId: string): string {
  return `aypik-first-word-replied:${userId}`;
}

export function readFirstWordRepliedThisSession(userId: string): string[] {
  if (!userId || typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(firstWordRepliedSessionKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && Boolean(id));
  } catch {
    return [];
  }
}

export function clearFirstWordRepliedThisSession(userId: string): void {
  if (!userId || typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(firstWordRepliedSessionKey(userId));
}

export function rememberFirstWordRepliedThisSession(
  userId: string,
  peerId: string
): void {
  if (!userId || !peerId || typeof sessionStorage === 'undefined') return;
  const next = readFirstWordRepliedThisSession(userId);
  if (!next.includes(peerId)) {
    next.push(peerId);
    sessionStorage.setItem(firstWordRepliedSessionKey(userId), JSON.stringify(next));
  }
  window.dispatchEvent(
    new CustomEvent(FIRST_WORD_REPLIED_EVENT, { detail: { userId, peerId } })
  );
}
