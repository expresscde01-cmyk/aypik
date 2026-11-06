import LanguageSwitcher from '@/i18n/LanguageSwitcher';
import { useTranslation } from 'react-i18next';

function LogoMark() {
  return (
    <img
      src="/aypik-coeur-mark.png?v=1"
      alt=""
      width={192}
      height={169}
      decoding="async"
      draggable={false}
    />
  );
}

export default function MaintenanceScreen({
  message,
}: {
  message?: string | null;
}) {
  const { t } = useTranslation();
  const lines = message?.trim()
    ? [message.trim()]
    : [t('common.maintenanceLine1'), t('common.maintenanceLine2')];

  return (
    <div className="maintenance-screen">
      <div className="page-glow" />
      <div className="wrap">
        <div className="card">
          <div className="flex justify-end mb-2">
            <LanguageSwitcher compact />
          </div>
          <div className="icon" aria-hidden>
            <LogoMark />
          </div>
          <img
            src="/aypik-nom.svg?v=1"
            alt="Aypik"
            width={3464}
            height={722}
            draggable={false}
            className="mx-auto mb-1 h-7 w-auto"
          />
          <h2>{t('common.maintenanceTitle')}</h2>
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <div className="sub">{t('common.maintenanceRetry')}</div>
        </div>
      </div>
    </div>
  );
}
