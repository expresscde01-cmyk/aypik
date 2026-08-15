import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** Statuts alignés sur les étages Mes Matchs. */
export type MatchesInboxStatus =
  | 'new'
  | 'wait'
  | 'matched'
  | 'matched-chat';

export type MatchesInboxEntry = {
  id: string;
  displayName: string;
  status: MatchesInboxStatus;
  origin: 'like' | 'flash';
};

type MatchesInboxSyncValue = {
  /** Snapshot publié par Mes Matchs (peut être vide si la page n’est pas montée). */
  entries: MatchesInboxEntry[];
  /** Tous les profils déjà vus en match (persiste pour la session). */
  matchedIds: Set<string>;
  pendingNewIds: Set<string>;
  waitingIds: Set<string>;
  /** Publie l’état courant des cartes Mes Matchs. */
  publish: (entries: MatchesInboxEntry[]) => void;
  /** Marque un profil comme résolu (match / refus) sans attendre le rechargement. */
  markResolved: (profileId: string, as: 'matched' | 'refused' | 'wait') => void;
};

const MatchesInboxSyncContext = createContext<MatchesInboxSyncValue | null>(
  null
);

export function MatchesInboxSyncProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [entries, setEntries] = useState<MatchesInboxEntry[]>([]);
  const matchedRef = useRef<Set<string>>(new Set());
  const refusedRef = useRef<Set<string>>(new Set());
  const [, bump] = useState(0);

  const publish = useCallback((next: MatchesInboxEntry[]) => {
    for (const e of next) {
      if (e.status === 'matched' || e.status === 'matched-chat') {
        matchedRef.current.add(e.id);
        refusedRef.current.delete(e.id);
      }
    }
    setEntries(next);
    bump((n) => n + 1);
  }, []);

  const markResolved = useCallback(
    (profileId: string, as: 'matched' | 'refused' | 'wait') => {
      if (as === 'matched') {
        matchedRef.current.add(profileId);
        refusedRef.current.delete(profileId);
      } else if (as === 'refused') {
        refusedRef.current.add(profileId);
        matchedRef.current.delete(profileId);
      }
      setEntries((prev) => {
        if (as === 'refused') {
          return prev.filter((e) => e.id !== profileId);
        }
        if (as === 'matched') {
          return prev.map((e) =>
            e.id === profileId
              ? { ...e, status: 'matched' as const }
              : e
          );
        }
        if (as === 'wait') {
          return prev.map((e) =>
            e.id === profileId ? { ...e, status: 'wait' as const } : e
          );
        }
        return prev;
      });
      bump((n) => n + 1);
    },
    []
  );

  const value = useMemo<MatchesInboxSyncValue>(() => {
    const pendingNewIds = new Set<string>();
    const waitingIds = new Set<string>();
    for (const e of entries) {
      if (matchedRef.current.has(e.id) || refusedRef.current.has(e.id)) {
        continue;
      }
      if (e.status === 'new') pendingNewIds.add(e.id);
      if (e.status === 'wait') waitingIds.add(e.id);
    }
    return {
      entries,
      matchedIds: new Set([
        ...matchedRef.current,
        ...entries
          .filter((e) => e.status === 'matched' || e.status === 'matched-chat')
          .map((e) => e.id),
      ]),
      pendingNewIds,
      waitingIds,
      publish,
      markResolved,
    };
  }, [entries, publish, markResolved]);

  return (
    <MatchesInboxSyncContext.Provider value={value}>
      {children}
    </MatchesInboxSyncContext.Provider>
  );
}

export function useMatchesInboxSync(): MatchesInboxSyncValue {
  const ctx = useContext(MatchesInboxSyncContext);
  if (!ctx) {
    return {
      entries: [],
      matchedIds: new Set(),
      pendingNewIds: new Set(),
      waitingIds: new Set(),
      publish: () => undefined,
      markResolved: () => undefined,
    };
  }
  return ctx;
}
