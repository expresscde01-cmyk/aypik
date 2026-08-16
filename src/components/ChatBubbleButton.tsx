/** Bouton messagerie — bulle rose, typing au survol. */
export default function ChatBubbleButton({
  name,
  unreadCount = 0,
  onClick,
}: {
  name: string;
  unreadCount?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chat-bubble-btn relative w-10 h-10 flex items-center justify-center flex-shrink-0 bg-transparent cursor-pointer"
      aria-label={`Envoyer un message à ${name}`}
      title="Ouvrir la messagerie"
    >
      <span className="chat-bubble-disk pointer-events-none">
        <svg
          className="chat-bubble-icon"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path
            className="chat-bubble-outline"
            d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle className="chat-typing-dot chat-typing-dot--1" cx="9.2" cy="10.6" r="1.05" fill="currentColor" />
          <circle className="chat-typing-dot chat-typing-dot--2" cx="12" cy="10.6" r="1.05" fill="currentColor" />
          <circle className="chat-typing-dot chat-typing-dot--3" cx="14.8" cy="10.6" r="1.05" fill="currentColor" />
        </svg>
      </span>
      {unreadCount > 0 ? (
        <span className="absolute -top-1 -right-1 z-10 min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center unread-badge-pulse">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
