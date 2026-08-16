/** Couronne rose unie — trois pointes, sans halo ni cercle. */
export function CrownIcon({
  className = '',
  size = '1.05em',
}: {
  className?: string;
  size?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`matcher-crown-mark ${className}`.trim()}
      style={{ width: size, height: size }}
      fill="currentColor"
      aria-hidden
    >
      <circle cx="3.65" cy="8.35" r="2.05" />
      <circle cx="12" cy="3.45" r="2.2" />
      <circle cx="20.35" cy="8.35" r="2.05" />
      <path d="M4.2 8.9 7.55 13.7 12 5.15 16.45 13.7 19.8 8.9 18.75 16.95H5.25Z" />
      <rect x="5.15" y="16.85" width="13.7" height="2.55" rx="0.55" />
    </svg>
  );
}

/** Mot Matcher avec couronne à la place du M. */
export default function MatcherWord({
  className = '',
}: {
  className?: string;
}) {
  return (
    <span className={`matcher-word ${className}`.trim()}>
      <CrownIcon />
      <span>atcher</span>
    </span>
  );
}
