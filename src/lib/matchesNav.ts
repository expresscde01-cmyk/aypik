import type { MatchPulseCategory } from '@/lib/pendingStudy';

/** Options de navigation vers Mes Matchs depuis la cloche / Accueil. */
export type OpenMatchesOpts =
  | boolean
  | {
      openChat?: boolean;
      /**
       * Rappel Attendre : surbrille une carte, scroll, ouvre la fiche.
       */
      highlight?: boolean;
      /** Prénom extrait du libellé notif (secours si actor_id ambigu). */
      hintName?: string | null;
      /**
       * Clignotement exclusif d’une catégorie (A = new, B = wait).
       * Remplace tout clignotement précédent.
       */
      pulseCategory?: MatchPulseCategory | null;
      /** @deprecated Utiliser pulseCategory: 'new' */
      pulsePendingAll?: boolean;
    };

export function normalizeOpenMatchesOpts(opts?: OpenMatchesOpts): {
  openChat: boolean;
  highlight: boolean;
  hintName: string | null;
  pulseCategory: MatchPulseCategory | null;
} {
  if (opts === true) {
    return {
      openChat: true,
      highlight: false,
      hintName: null,
      pulseCategory: null,
    };
  }
  if (!opts) {
    return {
      openChat: false,
      highlight: false,
      hintName: null,
      pulseCategory: null,
    };
  }
  const pulseCategory: MatchPulseCategory | null =
    opts.pulseCategory === 'new' || opts.pulseCategory === 'wait'
      ? opts.pulseCategory
      : opts.pulsePendingAll
        ? 'new'
        : null;
  return {
    openChat: Boolean(opts.openChat),
    highlight: Boolean(opts.highlight),
    hintName: opts.hintName?.trim() || null,
    pulseCategory,
  };
}
