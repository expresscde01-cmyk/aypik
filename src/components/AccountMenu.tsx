import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  ChevronDown,
  Eye,
  Filter,
  Lock,
  LogOut,
  RefreshCw,
  Trash2,
  UserRound,
} from 'lucide-react';
import { requestAccountDeletion } from '@/lib/deleteAccount';
import { userErrorMessage } from '@/lib/userError';
import { useAuth } from '@/lib/auth';
import { clearAypikAppCache } from '@/lib/appCache';
import { queryClient } from '@/lib/queryClient';
import { resetSuggestionSearchPrefs } from '@/lib/suggestionPrefs';
import {
  VISIBILITY_RADIO_OPTIONS,
  visibilityMenuHint,
  type VisibilityChoice,
} from '@/lib/accountStatus';

export default function AccountMenu({
  displayName,
  visibilityChoice,
  onVisibilityChange,
  onOpenProfile,
  onOpenPassword,
  onOpenNotifications,
  onSignOut,
  openRequestKey = 0,
}: {
  displayName: string;
  visibilityChoice: VisibilityChoice;
  onVisibilityChange: (choice: VisibilityChoice) => Promise<string | null>;
  onOpenProfile: () => void;
  onOpenPassword: () => void;
  onOpenNotifications: () => void;
  onSignOut: () => void;
  /** Incrémenté pour ouvrir le menu (badge statut) sur le sous-menu Visibilité. */
  openRequestKey?: number;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmResetFilters, setConfirmResetFilters] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const visibilityHint = visibilityMenuHint(visibilityChoice);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setVisibilityOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setVisibilityOpen(false);
        setConfirmDelete(false);
        setConfirmResetFilters(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!confirmResetFilters) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmResetFilters(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmResetFilters]);

  useEffect(() => {
    if (openRequestKey < 1) return;
    setError(null);
    setOpen(true);
    setVisibilityOpen(true);
  }, [openRequestKey]);

  const close = () => {
    setOpen(false);
    setVisibilityOpen(false);
  };

  const handleVisibilitySelect = async (choice: VisibilityChoice) => {
    if (choice === visibilityChoice) {
      close();
      return;
    }
    setError(null);
    setVisibilityBusy(true);
    try {
      const err = await onVisibilityChange(choice);
      if (err) {
        setError(err);
        return;
      }
      close();
    } finally {
      setVisibilityBusy(false);
    }
  };

  const handleRefreshPage = () => {
    close();
    clearAypikAppCache();
    window.location.reload();
  };

  const handleResetFilters = () => {
    if (!user?.id) {
      setConfirmResetFilters(false);
      return;
    }
    resetSuggestionSearchPrefs(user.id);
    void queryClient.invalidateQueries({ queryKey: ['suggest-profiles'] });
    setConfirmResetFilters(false);
    close();
  };

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      const deleteError = await requestAccountDeletion();
      if (deleteError) throw new Error(deleteError);
      setConfirmDelete(false);
      onSignOut();
    } catch (err) {
      setError(userErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 max-w-[9rem] sm:max-w-[11rem] truncate text-sm font-semibold text-gray-800 ml-1 rounded-lg px-1.5 py-1 -mx-0.5 hover:bg-rose-50 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title="Menu du compte"
        onClick={() => {
          setError(null);
          setOpen((v) => {
            if (v) setVisibilityOpen(false);
            return !v;
          });
        }}
      >
        <UserRound className="w-4 h-4 text-rose-500 shrink-0" />
        <span className="hidden sm:inline truncate">{displayName}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Menu du compte"
          className="absolute right-0 top-full mt-1.5 z-40 w-[min(100vw-2rem,22rem)] rounded-2xl border border-gray-100 bg-white py-1.5 shadow-xl shadow-gray-200/80 animate-fadeIn"
        >
          <MenuItem
            icon={<UserRound className="w-4 h-4" />}
            label="Mon profil"
            onClick={() => {
              close();
              onOpenProfile();
            }}
          />
          <MenuItem
            icon={<Lock className="w-4 h-4" />}
            label="Modifier mon mot de passe"
            onClick={() => {
              close();
              onOpenPassword();
            }}
          />
          <MenuItem
            icon={<Bell className="w-4 h-4" />}
            label="Notifications"
            onClick={() => {
              close();
              onOpenNotifications();
            }}
          />
          <button
            type="button"
            role="menuitem"
            aria-expanded={visibilityOpen}
            aria-haspopup="true"
            disabled={visibilityBusy}
            onClick={() => {
              setError(null);
              setVisibilityOpen((v) => !v);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-gray-800 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <span className="shrink-0 opacity-80">
              <Eye className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              Visibilité –{' '}
              <span className="text-emerald-600">{visibilityHint}</span>
            </span>
            <ChevronDown
              className={`w-4 h-4 text-emerald-600 transition-transform shrink-0 ${
                visibilityOpen ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
          </button>
          {visibilityOpen && (
            <div
              role="group"
              aria-label="Visibilité"
              className="mx-2 mb-1.5 rounded-xl border border-gray-100 bg-gray-50/80 py-1"
            >
              {VISIBILITY_RADIO_OPTIONS.map((option) => {
                const checked = option.id === visibilityChoice;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    disabled={visibilityBusy}
                    onClick={() => void handleVisibilitySelect(option.id)}
                    className={`w-full flex items-start gap-2.5 px-2.5 py-2 text-left text-[13px] leading-snug transition-colors disabled:opacity-50 hover:bg-slate-50 ${
                      checked
                        ? 'font-semibold text-gray-900'
                        : 'font-medium text-gray-700'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                        checked
                          ? 'border-emerald-600'
                          : 'border-gray-300'
                      }`}
                      aria-hidden
                    >
                      {checked && (
                        <span className="w-2 h-2 rounded-full bg-emerald-600" />
                      )}
                    </span>
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          <MenuItem
            icon={<RefreshCw className="w-4 h-4" />}
            label="Actualiser la page"
            onClick={handleRefreshPage}
          />
          <MenuItem
            icon={<Filter className="w-4 h-4" />}
            label="Réinitialiser mes filtres de recherche"
            disabled={!user?.id}
            onClick={() => {
              setError(null);
              setConfirmResetFilters(true);
              close();
            }}
          />
          <div className="my-1.5 border-t border-gray-100" role="separator" />
          <MenuItem
            icon={<Trash2 className="w-4 h-4" />}
            label="Supprimer mon compte"
            destructive
            onClick={() => {
              setError(null);
              setConfirmDelete(true);
              close();
            }}
          />
          <MenuItem
            icon={<LogOut className="w-4 h-4" />}
            label="Se déconnecter"
            onClick={() => {
              close();
              onSignOut();
            }}
          />
          {error && !confirmDelete && !confirmResetFilters && (
            <p className="mx-2 mt-1 mb-0.5 px-2 py-1.5 rounded-lg bg-red-50 text-red-700 text-[11px] leading-snug">
              {error}
            </p>
          )}
        </div>
      )}

      {confirmResetFilters &&
        createPortal(
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="account-reset-filters-title"
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4"
            >
              <h3
                id="account-reset-filters-title"
                className="text-base font-bold text-gray-900"
              >
                Réinitialiser tes filtres de recherche
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                Réinitialise tes filtres : périmètre élargi jusqu&apos;aux
                régions voisines, et 1 centre d&apos;intérêt en commun.
              </p>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmResetFilters(false)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="flex-1 py-3 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors"
                >
                  Réinitialiser
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {confirmDelete &&
        createPortal(
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="account-delete-title"
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4"
            >
              <h3
                id="account-delete-title"
                className="text-base font-bold text-gray-900"
              >
                Attention
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                Cette action est immédiate et définitive. Toutes tes données
                seront effacées. Si tu es Membre Fondateur, ton statut et ton
                numéro d&apos;inscription seront également perdus et ne
                pourront pas être récupérés.
              </p>
              {error && (
                <p className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(false);
                    setError(null);
                  }}
                  disabled={deleting}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  {deleting ? 'Suppression...' : 'Confirmer la suppression'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive = false,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium transition-colors disabled:opacity-50 ${
        destructive
          ? 'text-red-600 hover:bg-rose-50'
          : 'text-gray-800 hover:bg-slate-50'
      }`}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
