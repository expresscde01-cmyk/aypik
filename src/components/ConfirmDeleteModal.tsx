import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { t as tStatic } from '@/i18n/t';

export function deleteLinkConfirmMessage(): string {
  return tStatic('matches.deleteLinkConfirm');
}

export default function ConfirmDeleteModal({
  busy = false,
  message,
  emphasizeConfirm = false,
  onCancel,
  onConfirm,
}: {
  busy?: boolean;
  message?: string;
  emphasizeConfirm?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const text = message ?? t('matches.deleteLinkConfirm');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45"
        aria-label={t('common.cancel')}
        onClick={onCancel}
      />
      <div className="relative w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl border border-gray-100 animate-fadeIn">
        <p
          id="confirm-delete-title"
          className="text-sm font-semibold text-gray-900 leading-relaxed"
        >
          {text}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`py-2.5 rounded-xl btn-delete-confirm text-sm disabled:opacity-40${
              emphasizeConfirm ? ' btn-delete-confirm--emphasis' : ' font-semibold'
            }`}
          >
            {busy ? '…' : t('common.delete')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
