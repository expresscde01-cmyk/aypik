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

export async function getOrCreateConversation(otherUserId: string) {
  const { data, error } = await supabase.rpc('get_or_create_conversation', {
    other_user: otherUserId,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchMessages(conversationId: string, limit = 100) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data || []) as ChatMessage[];
}

export async function sendMessage(params: {
  conversationId: string;
  senderId: string;
  recipientId: string;
  content: string;
}) {
  const content = params.content.trim();
  if (!content) throw new Error('Message vide');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: params.conversationId,
      sender_id: params.senderId,
      recipient_id: params.recipientId,
      content,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as ChatMessage;
}

export async function markConversationRead(conversationId: string) {
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
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
