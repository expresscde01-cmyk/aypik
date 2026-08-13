import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, Send, AlertCircle, Heart } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useMembership } from '@/lib/useMembership';
import { offerLabel } from '@/lib/founderCopy';
import type { Profile } from '@/components/ProfileSetup';
import { ageFromBirthDate, isWithinAgeGap } from '@/lib/dating';
import {
  type ChatMessage,
  fetchMessages,
  formatMessageTime,
  getOrCreateConversation,
  markConversationRead,
  sendMessage,
} from '@/lib/messaging';

type ChatScreenProps = {
  peer: Profile;
  onClose: () => void;
};

export default function ChatScreen({ peer, onClose }: ChatScreenProps) {
  const { user } = useAuth();
  const { status } = useMembership();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: meRow } = await supabase
          .from('profiles')
          .select('birth_date')
          .eq('id', user.id)
          .maybeSingle();

        if (!meRow?.birth_date || !peer.birth_date) {
          throw new Error('Ce profil n’est plus disponible.');
        }

        const myAge = ageFromBirthDate(meRow.birth_date as string);
        const peerAge = ageFromBirthDate(peer.birth_date);
        if (
          !isWithinAgeGap(myAge, peerAge) ||
          !isWithinAgeGap(peerAge, myAge)
        ) {
          throw new Error('Ce profil n’est plus disponible.');
        }

        const convId = await getOrCreateConversation(peer.id);
        if (!active) return;
        setConversationId(convId);

        const history = await fetchMessages(convId);
        if (!active) return;
        setMessages(history);

        await markConversationRead(convId);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Impossible d’ouvrir la conversation'
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user, peer.id]);

  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const incoming = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });

          if (incoming.recipient_id === user.id) {
            try {
              await markConversationRead(conversationId);
            } catch {
              /* ignore */
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, loading]);

  const handleSend = async () => {
    if (!user || !conversationId || sending) return;
    const content = draft.trim();
    if (!content) return;

    setSending(true);
    setError(null);
    setDraft('');

    try {
      const message = await sendMessage({
        conversationId,
        senderId: user.id,
        recipientId: peer.id,
        content,
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      inputRef.current?.focus();
    } catch (err) {
      setDraft(content);
      setError(
        err instanceof Error ? err.message : 'Envoi impossible'
      );
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-rose-50/80 via-white to-amber-50/40">
      <header className="shrink-0 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-3 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500"
            aria-label="Retour aux matchs"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-rose-100 to-amber-100 shrink-0">
            {peer.photo_url ? (
              <img
                src={peer.photo_url}
                alt={peer.display_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-bold text-rose-400">
                {peer.display_name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900 text-sm truncate">
              {peer.display_name}
            </h2>
            <p className="text-[11px] text-gray-400 flex items-center gap-1">
              <Heart className="w-3 h-3 text-rose-400" fill="currentColor" />
              Match · messagerie privée
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3 min-h-full flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-16">
              <div className="w-9 h-9 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
            </div>
          ) : (
            <>
              {messages.length === 0 && !error && (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-100 to-amber-100 flex items-center justify-center mb-4">
                    <Heart className="w-7 h-7 text-rose-400" fill="currentColor" />
                  </div>
                  <p className="text-sm font-semibold text-gray-800">
                    C’est un match avec {peer.display_name}
                  </p>
                  <p className="text-xs text-gray-400 mt-1.5 max-w-xs">
                    Envoyez le premier message pour lancer la conversation.
                  </p>
                  <p className="text-xs text-gray-400 mt-1 max-w-xs">
                    Messagerie illimitée — c’est inclus dans{' '}
                    {offerLabel(status)}.
                  </p>
                </div>
              )}

              {messages.map((message, index) => {
                const mine = message.sender_id === user?.id;
                const prev = messages[index - 1];
                const showTime =
                  !prev ||
                  new Date(message.created_at).getTime() -
                    new Date(prev.created_at).getTime() >
                    5 * 60 * 1000;

                return (
                  <div key={message.id} className="space-y-1">
                    {showTime && (
                      <p className="text-center text-[10px] text-gray-400 py-1">
                        {formatMessageTime(message.created_at)}
                      </p>
                    )}
                    <div
                      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm ${
                          mine
                            ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white rounded-br-md'
                            : 'bg-white text-gray-800 border border-gray-100 rounded-bl-md'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {message.content}
                        </p>
                        {mine && (
                          <p className="text-[10px] text-rose-100/90 text-right mt-1">
                            {message.read_at ? 'Lu' : 'Envoyé'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-4 pb-2">
          <div className="max-w-2xl mx-auto flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <footer className="shrink-0 bg-white/95 backdrop-blur-md border-t border-gray-100 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto px-3 pt-3 flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={2000}
            placeholder={`Écrire à ${peer.display_name}…`}
            disabled={loading || !conversationId}
            className="flex-1 resize-none max-h-28 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={
              loading || !conversationId || sending || !draft.trim()
            }
            className="w-11 h-11 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white flex items-center justify-center shadow-md shadow-rose-200 disabled:opacity-40 disabled:shadow-none hover:brightness-105 transition-all shrink-0"
            aria-label="Envoyer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
