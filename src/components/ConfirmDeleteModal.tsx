import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export const DELETE_LINK_CONFIRM_MESSAGE =
  'Veux-tu vraiment supprimer ce lien ? Cette action est irréversible.';

export default function ConfirmDeleteModal({
  busy = false,
  message = DELETE_LINK_CONFIRM_MESSAGE,
  onCancel,
  onConfirm,
}: {
  busy?: boolean;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
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
        aria-label="Annuler"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl border border-gray-100 animate-fadeIn">
        <p
          id="confirm-delete-title"
          className="text-sm font-semibold text-gray-900 leading-relaxed"
        >
          {message}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="py-2.5 rounded-xl btn-delete-confirm text-sm font-semibold disabled:opacity-40"
          >
            {busy ? '…' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
