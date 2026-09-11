import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import type { Profile } from '@/components/ProfileSetup';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import ProfilePhoto from '@/components/ProfilePhoto';
import { matchManageDisplayError } from '@/lib/matchManageError';
import { useTranslation } from 'react-i18next';
import { t as tStatic } from '@/i18n/t';

function firstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return tStatic('matches.thisProfile');
  return trimmed.split(/\s+/)[0] || trimmed;
}

export type MatchManageMode = 'manage' | 'broken' | 'waiting';
export type MatchManageOrigin = 'like' | 'flash';

export default function MatchManageModal({
  peer,
  mode,
  origin = 'like',
  busy = false,
  error = null,
  onClose,
  onArchive,
  onBreak,
  onRestore,
  onPurge,
}: {
  peer: Pick<Profile, 'display_name' | 'photo_url'>;
  mode: MatchManageMode;
  /** Requis pour `mode="waiting"` (Like ou Flash). */
  origin?: MatchManageOrigin;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onArchive?: () => void;
  onBreak?: () => void;
  onRestore?: () => void;
  onPurge?: () => void;
}) {
  const { t } = useTranslation();
  const [confirmPurge, setConfirmPurge] = useState(false);
  const name = firstName(peer.display_name);
  const kindLabel = origin === 'flash' ? t('matches.flashOnly') : t('matches.likeOnly');
  const showArchivePurge = mode === 'manage' || mode === 'waiting';
  const displayError = matchManageDisplayError(error);

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
      ? t('matches.manageBrokenTitle', { name })
      : mode === 'waiting'
        ? t('matches.manageKindTitle', { kind: kindLabel, name })
        : t('matches.manageTitle', { name });

  const description =
    mode === 'broken' ? (
      t('matches.manageRestoreHint')
    ) : mode === 'waiting' ? (
      t('matches.waitingArchiveHint', { kind: kindLabel })
    ) : (
      t('matches.manageRestoreHint')
    );

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
        aria-label={t('common.closeAria')}
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
            <p className="text-xs text-gray-500 mt-1">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-50 flex items-center justify-center text-gray-400 shrink-0"
            aria-label={t('common.closeAria')}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {displayError ? (
          <p className="mx-5 mt-3 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
            {displayError}
          </p>
        ) : null}

        {showArchivePurge ? (
          <div className="p-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onArchive}
              className="btn-archive w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
            >
              {busy ? '…' : t('matches.archive')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmPurge(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl btn-purge-trigger text-sm font-semibold disabled:opacity-40 leading-tight"
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
                  <span>{t('matches.deletePermanently')}</span>
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
              className="w-full py-2.5 rounded-xl btn-restore-link text-sm font-semibold disabled:opacity-40"
            >
              {busy ? '…' : t('matches.restore')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmPurge(true)}
              className="w-full py-2.5 rounded-xl btn-purge-trigger text-sm font-semibold disabled:opacity-40"
            >
              {busy ? '…' : t('matches.deletePermanently')}
            </button>
          </div>
        )}
      </div>

      {confirmPurge ? (
        <ConfirmDeleteModal
          busy={busy}
          emphasizeConfirm
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
