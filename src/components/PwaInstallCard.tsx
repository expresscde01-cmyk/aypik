import { useState } from 'react';
import { Download, Share } from 'lucide-react';
import { pwaManualGuide, pwaNativeButtonLabel } from '@/lib/pwaInstall';
import { usePwaInstall } from '@/lib/usePwaInstall';

export default function PwaInstallCard() {
  const { kind, promptInstall } = usePwaInstall();
  const [manualOpen, setManualOpen] = useState(false);
  const guide = pwaManualGuide(kind);
  const nativeLabel = pwaNativeButtonLabel(
    typeof navigator === 'undefined' ? '' : navigator.userAgent
  );

  if (kind === 'hidden') return null;

  const pending = kind === 'pending';

  return (
    <div
      id="install-app"
      className="mt-4 bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-6 sm:p-8"
    >
      <h2 className="text-sm font-semibold text-gray-900 mb-1">
        INSTALLER L&apos;APPLICATION
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Ajoute Aypik à l&apos;écran d&apos;accueil (mobile) ou au bureau
        (ordinateur) pour y revenir en un tap, sans passer par le navigateur.
      </p>

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
          <button
            type="button"
            onClick={() => void promptInstall()}
            disabled={pending}
            className="w-full py-3 rounded-xl border border-rose-200 bg-white text-rose-600 font-semibold hover:bg-rose-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {nativeLabel}
          </button>
          {pending ? (
            <p className="mt-3 text-xs text-gray-400">
              Disponible dès que le navigateur le propose (souvent après une
              ou deux visites).
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
