/** Flux « Mis en attente par toi » : icône sens interdit → modale Gestion. */

export type WaitingManageUiEvent =
  | 'open-manage'
  | 'manage-dismiss'
  | 'manage-archive'
  | 'manage-purge';

export type WaitingManageServerMutation = 'none' | 'archive-local' | 'refuse';

/**
 * Où part la suppression d’un like en attente.
 * - `card-ban` : icône sens interdit sur la carte → modale Gestion (inchangé).
 * - `profile-sheet` : Jeter sur la fiche (déjà confirmé) → refus direct, sans Gestion.
 */
export type WaitingDeleteSurface = 'card-ban' | 'profile-sheet';

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

/** Carte : Gestion. Fiche Jeter (notif / feuille, confirm déjà affichée) : purge. */
export function waitingDeleteUi(
  surface: WaitingDeleteSurface
): 'open-manage' | 'purge' {
  return surface === 'profile-sheet' ? 'purge' : 'open-manage';
}
