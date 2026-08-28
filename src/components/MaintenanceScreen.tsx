const DEFAULT_LINES = [
  'Nous effectuons actuellement une mise à jour pour améliorer votre expérience.',
  'Le site sera de retour très bientôt — merci de votre patience !',
] as const;

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
        background: '#fff7f5',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#374151',
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          background: '#ffffff',
          border: '1px solid #ffe4e6',
          borderRadius: 24,
          padding: '40px 32px',
          textAlign: 'center',
          boxShadow: '0 10px 30px rgba(225, 29, 72, 0.06)',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            margin: '0 auto 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fff1f2',
            borderRadius: 16,
            fontSize: 28,
          }}
          aria-hidden
        >
          ❤️
        </div>
        <h1
          style={{
            margin: '0 0 4px',
            fontSize: 13,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            fontWeight: 800,
            color: '#f97316',
          }}
        >
          Aypik
        </h1>
        <h2
          style={{
            margin: '0 0 16px',
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
