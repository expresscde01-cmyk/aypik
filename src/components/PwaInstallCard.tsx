import { useState } from 'react';
import { Download, Share } from 'lucide-react';
import {
  pwaInstallDescription,
  pwaManualGuide,
  pwaNativeButtonLabel,
  pwaNativeWaitingHint,
  pwaNativeWaitingLabel,
} from '@/lib/pwaInstall';
import { usePwaInstall } from '@/lib/usePwaInstall';
import { useTranslation } from 'react-i18next';

export default function PwaInstallCard() {
  const { t } = useTranslation();
  const { kind, promptInstall } = usePwaInstall();
  const [manualOpen, setManualOpen] = useState(false);
  const guide = pwaManualGuide(kind);
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const touch =
    typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints || 0;
  const nativeLabel = pwaNativeButtonLabel(ua);
  const description = pwaInstallDescription(ua, touch);

  if (kind === 'hidden') return null;

  const pending = kind === 'pending';

  return (
    <div
      id="install-app"
      className="mt-4 bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-6 sm:p-8"
    >
      <h2 className="text-sm font-semibold text-gray-900 mb-1">
        {t('common.pwa.title')}
      </h2>
      <p className="text-sm text-gray-500 mb-4">{description}</p>

      {guide ? (
        <>
          <button
            type="button"
            onClick={() => setManualOpen((open) => !open)}
            className="w-full py-3 rounded-xl border border-rose-200 bg-white text-rose-600 font-semibold hover:bg-rose-50 transition-colors flex items-center justify-center gap-2"
            aria-expanded={manualOpen}
          >
            <Share className="w-4 h-4" />
            {guide.buttonLabel}
          </button>
          {manualOpen ? (
            <ol className="mt-4 space-y-2 text-sm text-gray-600 list-decimal list-inside leading-relaxed">
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
        </>
      ) : (
        <>
          {pending ? (
            <>
              <div
                className="w-full py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 font-semibold flex items-center justify-center gap-2 cursor-default select-none"
                aria-disabled="true"
              >
                <Download className="w-4 h-4" />
                {pwaNativeWaitingLabel()}
              </div>
              <p className="mt-3 text-xs text-gray-500">{pwaNativeWaitingHint()}</p>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="w-full py-3 rounded-xl border border-rose-200 bg-white text-rose-600 font-semibold hover:bg-rose-50 transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              {nativeLabel}
            </button>
          )}
        </>
      )}
    </div>
  );
}
