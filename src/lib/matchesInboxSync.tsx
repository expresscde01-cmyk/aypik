import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { mergeInboxPublish } from '@/lib/matchesNav';

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
  /** True dès le premier publish, même si la liste est vide (toutes fiches traitées). */
  hasSnapshot: boolean;
  /** Tous les profils déjà vus en match (persiste pour la session). */
  matchedIds: Set<string>;
  pendingNewIds: Set<string>;
  waitingIds: Set<string>;
  stickyMatched: Set<string>;
  stickyRefused: Set<string>;
  stickyWait: Set<string>;
  /** Entrées dans une rubrique pendant cette session (nouveautés, +1 chacune). */
  enteredNewIds: Set<string>;
  enteredWaitIds: Set<string>;
  enteredFirstIds: Set<string>;
  /** Publie l’état courant des cartes Mes Matchs. */
  publish: (entries: MatchesInboxEntry[]) => void;
  /** Marque un profil comme résolu (match / refus) sans attendre le rechargement. */
  markResolved: (
    profileId: string,
    as: 'matched' | 'refused' | 'wait' | 'new'
  ) => void;
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
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const matchedRef = useRef<Set<string>>(new Set());
  const refusedRef = useRef<Set<string>>(new Set());
  const waitRef = useRef<Set<string>>(new Set());
  const enteredNewRef = useRef<Set<string>>(new Set());
  const enteredWaitRef = useRef<Set<string>>(new Set());
  const enteredFirstRef = useRef<Set<string>>(new Set());
  const [, bump] = useState(0);

  const clearEntered = (profileId: string) => {
    enteredNewRef.current.delete(profileId);
    enteredWaitRef.current.delete(profileId);
    enteredFirstRef.current.delete(profileId);
  };

  const stickyOf = () => ({
    matched: matchedRef.current,
    refused: refusedRef.current,
    wait: waitRef.current,
  });

  const publish = useCallback((next: MatchesInboxEntry[]) => {
    for (const e of next) {
      if (e.status === 'matched' || e.status === 'matched-chat') {
        matchedRef.current.add(e.id);
        refusedRef.current.delete(e.id);
        waitRef.current.delete(e.id);
      }
      if (e.status === 'wait' && !matchedRef.current.has(e.id)) {
        waitRef.current.add(e.id);
      }
    }
    setHasSnapshot(true);
    setEntries(mergeInboxPublish(next, stickyOf()));
    bump((n) => n + 1);
  }, []);

  const markResolved = useCallback(
    (profileId: string, as: 'matched' | 'refused' | 'wait' | 'new') => {
      if (as === 'matched') {
        matchedRef.current.add(profileId);
        refusedRef.current.delete(profileId);
        waitRef.current.delete(profileId);
        clearEntered(profileId);
        enteredFirstRef.current.add(profileId);
      } else if (as === 'refused') {
        refusedRef.current.add(profileId);
        matchedRef.current.delete(profileId);
        waitRef.current.delete(profileId);
        clearEntered(profileId);
      } else if (as === 'wait') {
        waitRef.current.add(profileId);
        refusedRef.current.delete(profileId);
        clearEntered(profileId);
        enteredWaitRef.current.add(profileId);
      } else if (as === 'new') {
        waitRef.current.delete(profileId);
        refusedRef.current.delete(profileId);
        clearEntered(profileId);
        enteredNewRef.current.add(profileId);
      }
      setEntries((prev) => {
        let next = prev;
        if (as === 'refused') {
          next = prev.filter((e) => e.id !== profileId);
        } else if (as === 'matched') {
          next = prev.map((e) =>
            e.id === profileId ? { ...e, status: 'matched' as const } : e
          );
        } else if (as === 'wait') {
          next = prev.map((e) =>
            e.id === profileId ? { ...e, status: 'wait' as const } : e
          );
        } else if (as === 'new') {
          next = prev.map((e) =>
            e.id === profileId ? { ...e, status: 'new' as const } : e
          );
        }
        return mergeInboxPublish(next, stickyOf());
      });
      bump((n) => n + 1);
    },
    []
  );

  const value = useMemo<MatchesInboxSyncValue>(() => {
    const pendingNewIds = new Set<string>();
    const waitingIds = new Set<string>();
    const merged = mergeInboxPublish(entries, stickyOf());
    for (const e of merged) {
      if (matchedRef.current.has(e.id) || refusedRef.current.has(e.id)) {
        continue;
      }
      if (e.status === 'new') pendingNewIds.add(e.id);
      if (e.status === 'wait') waitingIds.add(e.id);
    }
    return {
      entries: merged,
      hasSnapshot,
      matchedIds: new Set([
        ...matchedRef.current,
        ...merged
          .filter((e) => e.status === 'matched' || e.status === 'matched-chat')
          .map((e) => e.id),
      ]),
      pendingNewIds,
      waitingIds,
      stickyMatched: new Set(matchedRef.current),
      stickyRefused: new Set(refusedRef.current),
      stickyWait: new Set(waitRef.current),
      enteredNewIds: new Set(enteredNewRef.current),
      enteredWaitIds: new Set(enteredWaitRef.current),
      enteredFirstIds: new Set(enteredFirstRef.current),
      publish,
      markResolved,
    };
  }, [entries, hasSnapshot, publish, markResolved]);

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
      hasSnapshot: false,
      matchedIds: new Set(),
      pendingNewIds: new Set(),
      waitingIds: new Set(),
      stickyMatched: new Set(),
      stickyRefused: new Set(),
      stickyWait: new Set(),
      enteredNewIds: new Set(),
      enteredWaitIds: new Set(),
      enteredFirstIds: new Set(),
      publish: () => undefined,
      markResolved: () => undefined,
    };
  }
  return ctx;
}

