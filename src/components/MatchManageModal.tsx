import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import type { Profile } from '@/components/ProfileSetup';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import ProfilePhoto from '@/components/ProfilePhoto';

function firstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'ce profil';
  return trimmed.split(/\s+/)[0] || trimmed;
}

export default function MatchManageModal({
  peer,
  mode,
  busy = false,
  error = null,
  onClose,
  onArchive,
  onBreak,
  onRestore,
  onPurge,
}: {
  peer: Pick<Profile, 'display_name' | 'photo_url'>;
  mode: 'manage' | 'broken';
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onArchive?: () => void;
  onBreak?: () => void;
  onRestore?: () => void;
  onPurge?: () => void;
}) {
  const [confirmPurge, setConfirmPurge] = useState(false);
  const name = firstName(peer.display_name);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmPurge) setConfirmPurge(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmPurge, onClose]);

  const title =
    mode === 'broken'
      ? `Match rompu avec ${name}`
      : `Gestion du match avec ${name}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-manage-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden animate-fadeIn">
        <header className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-start gap-3">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-rose-100 to-amber-100 shrink-0">
            {peer.photo_url ? (
              <ProfilePhoto
                src={peer.photo_url}
                eager
                width={96}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-base font-bold text-rose-400">
                {peer.display_name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2
              id="match-manage-title"
              className="text-base font-semibold text-gray-900 leading-snug"
            >
              {title}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {mode === 'broken'
                ? 'Rétablis ce match ou supprime définitivement ce lien.'
                : 'Archive ce match pour le retrouver dans Matchs rompus, ou supprime-le définitivement.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-50 flex items-center justify-center text-gray-400 shrink-0"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {error ? (
          <p className="mx-5 mt-3 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        ) : null}

        {mode === 'manage' ? (
          <div className="p-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onArchive}
              className="w-full py-2.5 rounded-xl bg-amber-100 text-amber-950 text-sm font-semibold hover:bg-amber-200 disabled:opacity-40"
            >
              {busy ? '…' : 'Archiver'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmPurge(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 leading-tight"
            >
              {busy ? (
                '…'
              ) : (
                <>
                  <Trash2
                    className="w-5 h-5 shrink-0"
                    strokeWidth={2.75}
                    aria-hidden
                  />
                  <span>Supprimer définitivement</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onRestore}
              className="w-full py-2.5 rounded-xl bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40"
            >
              {busy ? '…' : 'Rétablir'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmPurge(true)}
              className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {busy ? '…' : 'Supprimer définitivement'}
            </button>
          </div>
        )}
      </div>

      {confirmPurge ? (
        <ConfirmDeleteModal
          busy={busy}
          onCancel={() => setConfirmPurge(false)}
          onConfirm={() => {
            setConfirmPurge(false);
            onPurge?.();
          }}
        />
      ) : null}
    </div>,
    document.body
  );
}
