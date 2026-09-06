/** Flux « Mis en attente par toi » : icône sens interdit → modale Gestion. */

export type WaitingManageUiEvent =
  | 'open-manage'
  | 'manage-dismiss'
  | 'manage-archive'
  | 'manage-purge';

export type WaitingManageServerMutation = 'none' | 'archive-local' | 'refuse';

/**
 * Fermer ou ouvrir la modale ne mute pas inbox_responses.
 * Seuls Archiver (local) et Supprimer définitivement (refus serveur) le font.
 */
export function waitingManageServerMutation(
  event: WaitingManageUiEvent
): WaitingManageServerMutation {
  if (event === 'manage-archive') return 'archive-local';
  if (event === 'manage-purge') return 'refuse';
  return 'none';
}
