import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, MessageCircle, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useInboxReload, useUnreadMessages } from '@/lib/messaging';
import UnreadBadge, { unreadMessagesLabel } from '@/components/UnreadBadge';
import {
  displaySocialNotification,
  fetchPeersWithMessages,
  fetchSocialNotifications,
  markAllSocialNotificationsRead,
  markSocialNotificationRead,
  sweepStaleSocialNotifications,
  type SocialNotification,
} from '@/lib/suggestions';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'À l’instant';
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days} j`;
}

function isInboxNotification(n: SocialNotification): boolean {
  return (
    n.kind === 'like_received' ||
    n.kind === 'flash_received' ||
    n.kind === 'match_created' ||
    n.kind === 'message_received'
  );
}

export default function NotificationsBell({
  onOpenInbox,
}: {
  onOpenInbox?: (actorId?: string | null, openChat?: boolean) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SocialNotification[]>([]);
  const [peersWithMessages, setPeersWithMessages] = useState<Set<string>>(
    () => new Set()
  );
  const [loading, setLoading] = useState(false);
  const [ringing, setRinging] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 16 });
  const bellRef = useRef<HTMLButtonElement>(null);
  const prevMessageTotalRef = useRef(0);
  const primedRef = useRef(false);
  const unreadMessages = useUnreadMessages(user?.id, { channelKey: 'bell' });

  const isVisibleSocial = (n: SocialNotification) => {
    if (n.kind === 'message_received') return false;
    if (
      (n.kind === 'flash_received' || n.kind === 'like_received') &&
      n.read_at
    ) {
      return false;
    }
    // Messagerie ouverte → priorité à l’alerte message, plus de « C’est un match ! »
    if (n.kind === 'match_created' && n.actor_id) {
      if ((unreadMessages.bySender[n.actor_id] || 0) > 0) return false;
      if (peersWithMessages.has(n.actor_id)) return false;
    }
    return true;
  };

  const socialItems = items.filter(isVisibleSocial);
  const socialOnlyUnread = items.filter(
    (n) => !n.read_at && isVisibleSocial(n)
  ).length;
  const badgeCount = unreadMessages.total + socialOnlyUnread;
  const hasMessageAlert = unreadMessages.total > 0;
  const showMarkAll = socialOnlyUnread > 0;

  const refresh = useCallback(async () => {
    try {
      await sweepStaleSocialNotifications();
      const [list, peers] = await Promise.all([
        fetchSocialNotifications(25),
        fetchPeersWithMessages(),
      ]);
      setPeersWithMessages(peers);
      setItems(list);
    } catch {
      /* silencieux : inbox optionnelle */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 20000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useInboxReload(refresh);

  useEffect(() => {
    primedRef.current = false;
    prevMessageTotalRef.current = 0;
    setRinging(false);
  }, [user?.id]);

  useEffect(() => {
    if (!unreadMessages.ready) return;
    if (!primedRef.current) {
      primedRef.current = true;
      prevMessageTotalRef.current = unreadMessages.total;
      return;
    }
    if (unreadMessages.total > prevMessageTotalRef.current) {
      setRinging(true);
      const t = window.setTimeout(() => setRinging(false), 800);
      prevMessageTotalRef.current = unreadMessages.total;
      return () => window.clearTimeout(t);
    }
    prevMessageTotalRef.current = unreadMessages.total;
  }, [unreadMessages.ready, unreadMessages.total]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`social-inbox:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'social_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  const openMessageInbox = () => {
    closePanel();
    const senders = Object.entries(unreadMessages.bySender).filter(
      ([, n]) => n > 0
    );
    const only = senders.length === 1 ? senders[0][0] : null;
    onOpenInbox?.(only, Boolean(only));
  };

  const placePanel = () => {
    const rect = bellRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPanelPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  const handleOpen = async () => {
    const next = !open;
    if (next) {
      placePanel();
      setOpen(true);
      setLoading(true);
      await refresh();
      setLoading(false);
    } else {
      closePanel();
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAllSocialNotificationsRead();
    } catch {
      /* non bloquant */
    }
    setItems((prev) =>
      prev.filter(
        (n) => n.kind !== 'flash_received' && n.kind !== 'like_received'
      ).map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
    void sweepStaleSocialNotifications();
  };

  const handleItemClick = (n: SocialNotification) => {
    closePanel();
    if (isInboxNotification(n)) {
      onOpenInbox?.(n.actor_id, n.kind === 'message_received');
    }
    if (n.read_at) return;
    void markSocialNotificationRead(n.id)
      .then(async () => {
        if (n.kind === 'flash_received' || n.kind === 'like_received') {
          await sweepStaleSocialNotifications(n.actor_id);
        }
        setItems((prev) =>
          n.kind === 'flash_received' || n.kind === 'like_received'
            ? prev.filter((x) => x.id !== n.id)
            : prev.map((x) =>
                x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x
              )
        );
      })
      .catch(() => {
        /* le panneau est déjà fermé */
      });
  };

  const panel =
    open &&
    createPortal(
      <>
        <div
          className="fixed inset-0 z-[80]"
          aria-hidden
          onPointerDown={closePanel}
        />
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed z-[90] w-[min(100vw-2rem,20rem)] rounded-2xl border border-gray-100 bg-white shadow-xl shadow-gray-200/80 overflow-hidden animate-fadeIn"
          style={{ top: panelPos.top, right: panelPos.right }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            {showMarkAll && (
              <button
                type="button"
                onClick={() => void handleMarkAll()}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Tout lu
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && socialItems.length === 0 && !hasMessageAlert ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">
                Chargement…
              </p>
            ) : socialItems.length === 0 && !hasMessageAlert ? (
              <div className="px-4 py-8 text-center">
                <Sparkles className="w-6 h-6 text-rose-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  Aucune notification pour le moment
                </p>
              </div>
            ) : (
              <ul>
                {hasMessageAlert && (
                  <li>
                    <button
                      type="button"
                      onClick={openMessageInbox}
                      className="w-full text-left px-3 py-3 border-b border-rose-100 bg-rose-50/60 hover:bg-rose-50 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 relative w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0">
                          <MessageCircle className="w-3.5 h-3.5" />
                          <UnreadBadge
                            count={unreadMessages.total}
                            className="absolute -top-1 -right-1"
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-rose-800">
                            {unreadMessagesLabel(unreadMessages.total)}
                          </p>
                          <p className="text-xs text-rose-600 leading-relaxed mt-0.5">
                            Ouvre tes matchs pour répondre
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                )}
                {socialItems.map((n) => {
                  const copy = displaySocialNotification({
                    kind: n.kind,
                    title: n.title,
                    body: n.body,
                    flash_id: n.flash_id,
                    created_at: n.created_at,
                    action_type: n.action_type,
                    interaction_type: n.interaction_type,
                    source: n.source,
                    origin: n.origin,
                  });
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleItemClick(n)}
                        className={`w-full text-left px-3 py-3 border-b border-gray-50 hover:bg-rose-50/40 transition-colors ${
                          !n.read_at ? 'bg-rose-50/30' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              n.read_at ? 'bg-transparent' : 'bg-rose-500'
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {copy.title}
                            </p>
                            <p className="text-xs text-gray-600 leading-relaxed mt-0.5">
                              {copy.body}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-1">
                              {relativeTime(n.created_at)}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </>,
      document.body
    );

  return (
    <div className="relative">
      <button
        ref={bellRef}
        type="button"
        onClick={() => void handleOpen()}
        className="relative p-2 rounded-xl text-gray-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
        aria-label={
          badgeCount > 0
            ? `Notifications, ${badgeCount} non lus`
            : 'Notifications'
        }
        aria-expanded={open}
      >
        <Bell className={`w-5 h-5 ${ringing ? 'bell-ring' : ''}`} />
        {badgeCount > 0 && (
          <span
            key={badgeCount}
            className={`absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ${
              ringing ? 'bell-badge-pop' : ''
            }`}
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}
