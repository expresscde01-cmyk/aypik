import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
};

function logSupabaseError(context: string, error: unknown) {
  console.error('Erreur Supabase détaillée:', error);
  console.error(`[messaging] ${context}`, error);
}

export async function ensureConversationId(
  otherUserId: string
): Promise<string | null> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user?.id;
    if (!me || me === otherUserId) return null;

    const userA = me < otherUserId ? me : otherUserId;
    const userB = me < otherUserId ? otherUserId : me;

    const existing = await supabase
      .from('conversations')
      .select('id')
      .eq('user_a', userA)
      .eq('user_b', userB)
      .maybeSingle();
    if (existing.data?.id) return existing.data.id as string;
    return null;
  } catch (err) {
    logSupabaseError('ensureConversationId', err);
    return null;
  }
}

export async function fetchMessagesForPeer(peerId: string, limit = 100) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user?.id;
    if (!me) return [] as ChatMessage[];
    const { data } = await supabase
      .from('messages')
      .select(
        'id, conversation_id, sender_id, recipient_id, content, created_at, read_at'
      )
      .or(
        `and(sender_id.eq.${me},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${me})`
      )
      .order('created_at', { ascending: true })
      .limit(limit);
    return (data || []) as ChatMessage[];
  } catch (err) {
    logSupabaseError('fetchMessagesForPeer', err);
    return [] as ChatMessage[];
  }
}

export async function countUnreadMessages(userId: string): Promise<number> {
  const bySender = await unreadCountsBySender(userId);
  return Object.values(bySender).reduce((sum, n) => sum + n, 0);
}

export async function unreadCountsBySender(
  userId: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('unread_message_counts');
  if (!error && Array.isArray(data)) {
    const map: Record<string, number> = {};
    for (const row of data as { sender_id: string; unread_count: number }[]) {
      if (!row?.sender_id) continue;
      map[row.sender_id] = Number(row.unread_count) || 0;
    }
    return map;
  }

  const { data: rows, error: tableError } = await supabase
    .from('messages')
    .select('sender_id')
    .eq('recipient_id', userId)
    .is('read_at', null);
  if (tableError) {
    logSupabaseError('unreadCountsBySender', tableError);
    return {};
  }
  const map: Record<string, number> = {};
  for (const row of rows || []) {
    const senderId = (row as { sender_id: string }).sender_id;
    if (!senderId) continue;
    map[senderId] = (map[senderId] || 0) + 1;
  }
  return map;
}

const INBOX_EVENT = 'aypik:inbox-updated';

export type InboxUpdatedDetail = {
  actorId?: string | null;
  decision?: 'wait' | 'refuse' | 'match' | null;
};

export function emitInboxUpdated(detail?: InboxUpdatedDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(INBOX_EVENT, { detail: detail ?? {} })
  );
}

/** Badge non lus du user connecté (recipient_id = moi, read_at IS NULL). */
export function useUnreadMessages(
  userId: string | undefined,
  options?: { ignoreSenderId?: string | null; channelKey?: string }
) {
  const [bySender, setBySender] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  const ignoreRef = useRef(options?.ignoreSenderId ?? null);
  ignoreRef.current = options?.ignoreSenderId ?? null;

  const refresh = useCallback(async () => {
    if (!userId) {
      setBySender({});
      setReady(true);
      return;
    }
    const next = await unreadCountsBySender(userId);
    setBySender(next);
    setReady(true);
  }, [userId]);

  useEffect(() => {
    setBySender({});
    setReady(false);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const key = options?.channelKey || 'default';

    const applyIncoming = (row: ChatMessage | undefined) => {
      if (!row?.id || !row.sender_id) return;
      if (row.recipient_id !== userId) return;
      if (row.read_at) return;
      if (row.sender_id === ignoreRef.current) return;
      setBySender((prev) => ({
        ...prev,
        [row.sender_id]: (prev[row.sender_id] || 0) + 1,
      }));
    };

    const channel = supabase
      .channel(`unread-messages:${key}:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          applyIncoming(payload.new as ChatMessage);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    const poll = window.setInterval(() => void refresh(), 5000);
    const onFocus = () => void refresh();
    const onInbox = () => void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener(INBOX_EVENT, onInbox);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener(INBOX_EVENT, onInbox);
      void supabase.removeChannel(channel);
    };
  }, [userId, options?.channelKey, refresh]);

  const total = Object.values(bySender).reduce((sum, n) => sum + n, 0);
  return { bySender, total, ready, refresh };
}

export function useInboxReload(
  onReload: (detail?: InboxUpdatedDetail) => void
) {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<InboxUpdatedDetail>).detail;
      onReload(detail);
    };
    window.addEventListener(INBOX_EVENT, handler);
    return () => window.removeEventListener(INBOX_EVENT, handler);
  }, [onReload]);
}

export async function fetchMessages(conversationId: string, limit = 100) {
  try {
    const { data } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, recipient_id, content, created_at, read_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);
    return (data || []) as ChatMessage[];
  } catch (err) {
    logSupabaseError('fetchMessages', err);
    return [] as ChatMessage[];
  }
}

export async function sendMessage(params: {
  conversationId: string;
  senderId: string;
  recipientId: string;
  content: string;
}) {
  const content = params.content.trim();
  if (!content) throw new Error('Message vide');

  const { data, error } = await supabase.rpc('insert_chat_message', {
    p_recipient: params.recipientId,
    p_content: content,
  });

  if (error) {
    console.error('Erreur Supabase détaillée:', error);
    throw error;
  }
  if (!data) {
    throw new Error('Envoi : aucune ligne renvoyée');
  }
  emitInboxUpdated();
  return data as ChatMessage;
}

export async function markConversationRead(conversationId: string) {
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  emitInboxUpdated();
}

export function formatMessageTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
