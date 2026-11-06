const OPEN_FILTERS_KEY = 'aypik:open-discover-filters';

/** Demande d’ouvrir le réglage de périmètre au prochain affichage de Découvrir. */
export function requestDiscoverFilters(): void {
  try {
    sessionStorage.setItem(OPEN_FILTERS_KEY, '1');
  } catch {
    /* navigation privée : le bouton ouvre quand même Découvrir */
  }
}

export function consumeDiscoverFiltersRequest(): boolean {
  try {
    if (sessionStorage.getItem(OPEN_FILTERS_KEY) !== '1') return false;
    sessionStorage.removeItem(OPEN_FILTERS_KEY);
    return true;
  } catch {
    return false;
  }
}
