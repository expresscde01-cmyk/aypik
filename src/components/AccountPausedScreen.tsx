import { useState } from 'react';
import { BrandLockup, BrandMark } from '@/components/BrandLockup';
import { accountStatusHomeBanner } from '@/lib/accountStatus';
import { useTranslation } from 'react-i18next';

export default function AccountPausedScreen({
  onReactivate,
}: {
  onReactivate: () => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = accountStatusHomeBanner('deactivated');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-slate-50 via-white to-gray-100">
      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-200 shadow-xl shadow-gray-200/60 p-8 text-center space-y-5">
        <div className="flex flex-col items-center gap-2">
          <BrandMark size="sm" />
          <BrandLockup />
        </div>
        <h1 className="text-xl font-bold text-gray-900">{t('profile.pausedScreenTitle')}</h1>
        <p className="text-sm text-gray-600 leading-relaxed">{copy.text}</p>
        {error ? (
          <p className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (busy) return;
            setError(null);
            setBusy(true);
            void onReactivate()
              .then((err) => {
                if (err) setError(err);
              })
              .finally(() => setBusy(false));
          }}
          className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-60"
        >
          {busy ? t('profile.reactivating') : t('profile.reactivate')}
        </button>
      </div>
    </div>
  );
}
