/** Options de navigation vers Mes Matchs depuis la cloche / Accueil. */
export type OpenMatchesOpts =
  | boolean
  | {
      openChat?: boolean;
      /** Surbrillance carte (rappel Attendre) — sans ouvrir la fiche. */
      highlight?: boolean;
      /** Prénom extrait du libellé notif (secours si actor_id ambigu). */
      hintName?: string | null;
    };

export function normalizeOpenMatchesOpts(opts?: OpenMatchesOpts): {
  openChat: boolean;
  highlight: boolean;
  hintName: string | null;
} {
  if (opts === true) {
    return { openChat: true, highlight: false, hintName: null };
  }
  if (!opts || opts === false) {
    return { openChat: false, highlight: false, hintName: null };
  }
  return {
    openChat: Boolean(opts.openChat),
    highlight: Boolean(opts.highlight),
    hintName: opts.hintName?.trim() || null,
  };
}
