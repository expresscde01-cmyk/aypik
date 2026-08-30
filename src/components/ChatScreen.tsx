import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Send, AlertCircle, Heart } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useMembership } from '@/lib/useMembership';
import { offerLabel } from '@/lib/founderCopy';
import type { Profile } from '@/components/ProfileSetup';
import {
  type ChatMessage,
  ensureConversationId,
  fetchMessages,
  fetchMessagesForPeer,
  formatMessageTime,
  markConversationRead,
  sendMessage,
} from '@/lib/messaging';
import {
  archiveActiveMatch,
  breakActiveMatch,
} from '@/lib/matchBreaks';
import { userErrorMessage } from '@/lib/userError';
import MatchManageModal from '@/components/MatchManageModal';
import ProfilePhoto from '@/components/ProfilePhoto';

type ChatScreenProps = {
  peer: Profile;
  onClose: () => void;
  onMatchHidden?: () => void;
};

export default function ChatScreen({
  peer,
  onClose,
  onMatchHidden,
}: ChatScreenProps) {
  const { user } = useAuth();
  const { status } = useMembership();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManage, setShowManage] = useState(false);
  const [manageBusy, setManageBusy] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);
      setMessages([]);
      try {
        const convId = await ensureConversationId(peer.id);
        if (!active) return;
        const history = convId
          ? await fetchMessages(convId)
          : await fetchMessagesForPeer(peer.id);
        if (!active) return;
        if (convId) setConversationId(convId);
        else if (history[0]?.conversation_id) {
          setConversationId(history[0].conversation_id);
        }
        setMessages(history);
        const readId = convId || history[0]?.conversation_id;
        if (readId) {
          void markConversationRead(readId).catch(() => undefined);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user, peer.id]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`chat:${user.id}:${peer.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${user.id}`,
        },
        async (payload) => {
          const incoming = payload.new as ChatMessage;
          if (incoming.sender_id !== peer.id) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
          if (incoming.conversation_id) {
            setConversationId(incoming.conversation_id);
            try {
              await markConversationRead(incoming.conversation_id);
            } catch {
              /* ignore */
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${peer.id}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          if (incoming.recipient_id !== user.id) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
          if (incoming.conversation_id) {
            setConversationId(incoming.conversation_id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as ChatMessage;
          if (updated.sender_id !== peer.id && updated.recipient_id !== peer.id) {
            return;
          }
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, peer.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, loading]);

  const handleSend = async () => {
    if (!user || sending) return;
    const content = draft.trim();
    if (!content) return;

    setSending(true);
    setError(null);

    const optimisticId = `local-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      conversation_id: conversationId || '',
      sender_id: user.id,
      recipient_id: peer.id,
      content,
      created_at: new Date().toISOString(),
      read_at: null,
    };

    setDraft('');
    setMessages((prev) => [...prev, optimistic]);
    inputRef.current?.focus();

    try {
      const message = await sendMessage({
        conversationId: conversationId || '',
        senderId: user.id,
        recipientId: peer.id,
        content,
      });
      setError(null);
      if (message.conversation_id) {
        setConversationId(message.conversation_id);
      }
      setMessages((prev) => {
        const withoutLocal = prev.filter((m) => m.id !== optimisticId);
        if (withoutLocal.some((m) => m.id === message.id)) return withoutLocal;
        return [...withoutLocal, message];
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraft(content);
      setError(
        userErrorMessage(err, 'Impossible d’envoyer le message. Réessaie.')
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

  const runManage = async (action: 'archive' | 'break') => {
    if (manageBusy) return;
    setManageBusy(true);
    setManageError(null);
    try {
      if (action === 'break') await breakActiveMatch(peer.id);
      else await archiveActiveMatch(peer.id);
      setShowManage(false);
      onMatchHidden?.();
      onClose();
    } catch (err) {
      setManageError(
        userErrorMessage(
          err,
          action === 'break'
            ? 'Impossible de rompre ce lien.'
            : 'Impossible d’archiver ce match.'
        )
      );
    } finally {
      setManageBusy(false);
    }
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={`Conversation avec ${peer.display_name}`}>
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
        aria-label="Fermer la conversation"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 flex h-full w-full sm:max-w-md flex-col bg-white shadow-[-12px_0_40px_rgba(15,23,42,0.18)] border-l border-gray-200">
        <header className="shrink-0 bg-white border-b border-rose-100">
          <div className="px-3 h-14 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg hover:bg-rose-50 flex items-center justify-center text-gray-500"
              aria-label="Retour aux matchs"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-rose-100 to-amber-100 shrink-0">
              {peer.photo_url ? (
                <ProfilePhoto
                  src={peer.photo_url}
                  eager
                  width={96}
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
              <p className="text-[11px] text-rose-500 font-medium flex items-center gap-1">
                <Heart className="w-3 h-3" fill="currentColor" />
                Conversation
              </p>
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto bg-white">
          <div className="px-4 py-4 space-y-2.5 min-h-full flex flex-col bg-white">
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
                    <p className="text-xs text-gray-500 mt-1.5 max-w-xs">
                      Tes messages s’affichent ici, dans ce fil de discussion.
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
                          className={`message-bubble ${mine ? 'sent' : 'received'}`}
                        >
                          <p className="whitespace-pre-wrap break-words">
                            {message.content}
                          </p>
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
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-words whitespace-pre-wrap">{error}</span>
            </div>
          </div>
        )}

        <footer className="shrink-0 bg-white border-t-2 border-rose-200 shadow-[0_-10px_28px_rgba(136,19,55,0.1)] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="px-4 pt-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-500 mb-2">
              Écrire un message
            </p>
            <form
              className="flex items-end gap-2 rounded-2xl border border-rose-200 bg-rose-50/80 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
            >
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                maxLength={2000}
                placeholder={`Écrire à ${peer.display_name}…`}
                readOnly={false}
                disabled={sending}
                className="flex-1 resize-none max-h-28 rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-300 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white flex items-center justify-center shadow-md shadow-rose-300/70 disabled:opacity-40 disabled:shadow-none hover:brightness-105 transition-all shrink-0"
                aria-label="Envoyer"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
            <p className="text-center pt-2.5 pb-0.5">
              <button
                type="button"
                onClick={() => {
                  setManageError(null);
                  setShowManage(true);
                }}
                className="text-[12px] text-gray-500 underline decoration-gray-400/80 underline-offset-2 decoration-from-font bg-amber-50/90 px-1 rounded-sm hover:text-slate-700 hover:bg-amber-100/80"
              >
                Gérer ce match
              </button>
            </p>
          </div>
        </footer>
      </aside>
      {showManage ? (
        <MatchManageModal
          peer={peer}
          mode="manage"
          busy={manageBusy}
          error={manageError}
          onClose={() => setShowManage(false)}
          onArchive={() => void runManage('archive')}
          onPurge={() => void runManage('break')}
        />
      ) : null}
    </div>,
    document.body
  );
}
