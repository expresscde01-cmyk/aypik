const DEFAULT_LINES = [
  'Nous effectuons actuellement une mise à jour pour améliorer votre expérience.',
  'Le site sera de retour très bientôt — merci de votre patience !',
] as const;

function LogoMark() {
  return (
    <svg width={34} height={34} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="heartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      <path
        fill="url(#heartGrad)"
        d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z"
      />
      <path
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
        background: '#fdf9f6',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#374151',
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 24,
          padding: '40px 32px',
          textAlign: 'center',
          boxShadow: '0 10px 30px rgba(17, 24, 39, 0.06)',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#ffffff',
            border: '1px solid #f3f4f6',
            borderRadius: 18,
            boxShadow: '0 6px 16px rgba(17, 24, 39, 0.08)',
          }}
          aria-hidden
        >
          <LogoMark />
        </div>
        <h1
          style={{
            margin: '0 0 4px',
            fontSize: 20,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontWeight: 800,
            color: '#111827',
          }}
        >
          Aypik
        </h1>
        <h2
          style={{
            margin: '16px 0 16px',
            fontSize: 22,
            lineHeight: 1.3,
            color: '#111827',
          }}
        >
          Site en maintenance
        </h2>
        {lines.map((line) => (
          <p
            key={line}
            style={{
              margin: '0 0 8px',
              fontSize: 15,
              lineHeight: 1.6,
              color: '#4b5563',
            }}
          >
            {line}
          </p>
        ))}
        <div
          style={{
            marginTop: 20,
            fontSize: 13,
            color: '#9ca3af',
          }}
        >
          Si besoin, réessayez dans quelques minutes.
        </div>
      </div>
    </div>
  );
}
