import { t } from '@/i18n/t';

export function formatUnreadCount(count: number): string {
  return count > 9 ? '9+' : String(count);
}

export function unreadMessagesLabel(count: number): string {
  if (count <= 0) return '';
  if (count === 1) return t('notifications.unreadOne');
  if (count > 9) return t('notifications.unreadMoreThan9');
  return t('notifications.unreadMany', { count });
}

/** Encadré synthèse cloche — messages non lus. */
export function unreadMessagesRecapCopy(count: number): {
  title: string;
  body: string;
} {
  const n = Math.max(0, count);
  const qty =
    n <= 1
      ? t('notifications.unreadOne')
      : n > 9
        ? t('notifications.unreadMoreThan9')
        : t('notifications.unreadMany', { count: n });
  return {
    title: t('notifications.unreadRecapTitle', { qty }),
    body: t('notifications.unreadRecapBody'),
  };
}

/** Pastille rouge numérique — même visuel que l’onglet Matchs. */
export default function UnreadBadge({
  count,
  className = '',
  pulse = false,
}: {
  count: number;
  className?: string;
  pulse?: boolean;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={`min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm shadow-rose-300/70 ${
        pulse ? 'unread-badge-pulse' : ''
      } ${className}`}
      aria-hidden
    >
      {formatUnreadCount(count)}
    </span>
  );
}
