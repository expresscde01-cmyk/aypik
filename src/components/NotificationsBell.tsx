import { useCallback, useEffect, useState } from 'react';
import { Bell, Sparkles, CheckCheck } from 'lucide-react';
import {
  countUnreadSocialNotifications,
  fetchSocialNotifications,
  markAllSocialNotificationsRead,
  markSocialNotificationRead,
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

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SocialNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [list, count] = await Promise.all([
        fetchSocialNotifications(25),
        countUnreadSocialNotifications(),
      ]);
      setItems(list);
      setUnread(count);
    } catch {
      /* silencieux : inbox optionnelle */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 45000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const handleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await refresh();
      setLoading(false);
    }
  };

  const handleMarkAll = async () => {
    await markAllSocialNotificationsRead();
    setItems((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
    setUnread(0);
  };

  const handleItemClick = async (n: SocialNotification) => {
    if (!n.read_at) {
      await markSocialNotificationRead(n.id);
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id
            ? { ...x, read_at: new Date().toISOString() }
            : x
        )
      );
      setUnread((u) => Math.max(0, u - 1));
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void handleOpen()}
        className="relative p-2 rounded-xl text-gray-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            aria-label="Fermer les notifications"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 z-40 w-[min(100vw-2rem,20rem)] rounded-2xl border border-gray-100 bg-white shadow-xl shadow-gray-200/80 overflow-hidden animate-fadeIn">
            <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900">Notifications</p>
              {unread > 0 && (
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
              {loading && items.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-gray-400">
                  Chargement…
                </p>
              ) : items.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Sparkles className="w-6 h-6 text-rose-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    Aucune notification pour le moment
                  </p>
                </div>
              ) : (
                <ul>
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void handleItemClick(n)}
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
                              {n.title}
                            </p>
                            <p className="text-xs text-gray-600 leading-relaxed mt-0.5">
                              {n.body}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-1">
                              {relativeTime(n.created_at)}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
