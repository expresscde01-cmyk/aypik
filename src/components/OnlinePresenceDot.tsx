/** Point « en ligne » — uniquement si le serveur a renvoyé is_online. */
export function OnlinePresenceDot({
  online,
  size = 'card',
}: {
  online?: boolean | null;
  size?: 'card' | 'avatar';
}) {
  if (!online) return null;
  return (
    <span
      className={
        size === 'avatar'
          ? 'absolute bottom-0.5 right-0.5 z-[3] h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white pointer-events-none'
          : 'absolute bottom-2 right-2 z-[3] h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white pointer-events-none'
      }
      title="En ligne"
      aria-label="En ligne"
    />
  );
}
