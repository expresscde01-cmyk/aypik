const DEFAULT_LINES = [
  'Nous effectuons actuellement une mise à jour pour améliorer votre expérience.',
  'Le site sera de retour très bientôt — merci de votre patience !',
] as const;

const HEART_PATH =
  'M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z';

function LogoMark() {
  return (
    <svg width={34} height={34} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="heartGrad" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="45%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <radialGradient id="heartHighlight" cx="32%" cy="22%" r="45%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="heart-shape">
        <path fill="url(#heartGrad)" d={HEART_PATH} />
        <path className="heart-highlight" fill="url(#heartHighlight)" d={HEART_PATH} />
      </g>
      <path
        className="sparkle"
        fill="#ffffff"
        d="M16.3 5.2l.55 1.65 1.65.55-1.65.55-.55 1.65-.55-1.65-1.65-.55 1.65-.55z"
      />
    </svg>
  );
}

export default function MaintenanceScreen({
  message,
}: {
  message?: string | null;
}) {
  const lines = message?.trim() ? [message.trim()] : DEFAULT_LINES;

  return (
    <div className="maintenance-screen">
      <div className="page-glow" />
      <div className="wrap">
        <div className="card">
          <div className="icon" aria-hidden>
            <LogoMark />
          </div>
          <h1>Aypik</h1>
          <h2>Site en maintenance</h2>
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <div className="sub">Si besoin, réessayez dans quelques minutes.</div>
        </div>
      </div>
    </div>
  );
}
