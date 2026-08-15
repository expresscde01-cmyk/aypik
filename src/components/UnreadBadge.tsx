export function formatUnreadCount(count: number): string {
  return count > 9 ? '9+' : String(count);
}

export function unreadMessagesLabel(count: number): string {
  if (count <= 0) return '';
  if (count === 1) return '1 message non lu';
  if (count > 9) return 'Plus de 9 messages non lus';
  return `${count} messages non lus`;
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
