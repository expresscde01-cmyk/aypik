import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { shouldRetryBellDialogue } from '@/lib/digestCopy';
import { userErrorMessage } from '@/lib/userError';
import { retainDepartingMatches } from '@/lib/matchCardDepart';
import { fetchMatchBreaks } from '@/lib/matchBreaks';
import { useInboxReload, warnSupabaseFailure } from '@/lib/messaging';
import { isMineWaitArchived } from '@/lib/waitArchives';
import { useMatchesInboxSync, type MatchesInboxStatus } from '@/lib/matchesInboxSync';
import {
  loadMatchesBoard,
  type Match,
  type WaitPrune,
} from '@/lib/loadMatchesBoard';
import type { ProfileGender } from '@/components/ProfileSetup';

type MatchesBoardValue = {
  matches: Match[];
  setMatches: Dispatch<SetStateAction<Match[]>>;
  peersWithChat: Set<string>;
  setPeersWithChat: Dispatch<SetStateAction<Set<string>>>;
  peersIWroteTo: Set<string>;
  setPeersIWroteTo: Dispatch<SetStateAction<Set<string>>>;
  myGender: ProfileGender | null;
  loaded: boolean;
  inFlight: boolean;
  error: string | null;
  refreshMatches: () => Promise<void>;
  invalidateMatchesLoad: () => void;
  twoWayDialogueRef: MutableRefObject<Set<string>>;
  wroteFromMeRef: MutableRefObject<Set<string>>;
  restoredWaitActorsRef: MutableRefObject<Set<string>>;
  departingIdsRef: MutableRefObject<Set<string>>;
  setPageBrokenIds: (ids: Set<string>) => void;
  bindWaitPrune: (fn: WaitPruneSetter | null) => void;
  noteDeparting: (ref: MutableRefObject<Set<string>> | null) => void;
};

type WaitRow = { source: string; profile: { id: string } };
type WaitPruneSetter = (updater: (prev: WaitRow[]) => WaitRow[]) => void;

const MatchesBoardContext = createContext<MatchesBoardValue | null>(null);

export function MatchesBoardProvider({
  children,
  profileEpoch = 0,
}: {
  children: ReactNode;
  profileEpoch?: number;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { publish } = useMatchesInboxSync();
  const [matches, setMatches] = useState<Match[]>([]);
  const [peersWithChat, setPeersWithChat] = useState<Set<string>>(() => new Set());
  const [peersIWroteTo, setPeersIWroteTo] = useState<Set<string>>(() => new Set());
  const [myGender, setMyGender] = useState<ProfileGender | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverBrokenIds, setServerBrokenIds] = useState<Set<string>>(() => new Set());
  const [pageBrokenIds, setPageBrokenIdsState] = useState<Set<string>>(() => new Set());
  const loadedRef = useRef(false);
  const inFlightRef = useRef(false);
  const [, setInFlightTick] = useState(0);
  const genRef = useRef(0);
  const accountRef = useRef<string | null | undefined>(undefined);
  const twoWayDialogueRef = useRef<Set<string>>(new Set());
  const wroteFromMeRef = useRef<Set<string>>(new Set());
  const restoredWaitActorsRef = useRef<Set<string>>(new Set());
  const departingIdsRef = useRef<Set<string>>(new Set());
  const externalDeparting = useRef<MutableRefObject<Set<string>> | null>(null);
  const waitPruneRef = useRef<WaitPruneSetter | null>(null);
  const sessionAccountId = user?.id ?? null;
  const [trackedAccountId, setTrackedAccountId] = useState(sessionAccountId);

  if (trackedAccountId !== sessionAccountId) {
    setTrackedAccountId(sessionAccountId);
    accountRef.current = sessionAccountId;
    loadedRef.current = false;
    setLoaded(false);
    setMatches([]);
    setPeersWithChat(new Set());
    setPeersIWroteTo(new Set());
    setServerBrokenIds(new Set());
    setPageBrokenIdsState(new Set());
    setError(null);
  } else if (accountRef.current !== sessionAccountId) {
    accountRef.current = sessionAccountId;
  }

  const applyWaitPrune = (prune: WaitPrune | null) => {
    if (!prune || !waitPruneRef.current) return;
    const fn = waitPruneRef.current;
    const { inboxOk, pendingOthersOk, waitingActors, liveWaitPeerIds } = prune;
    fn((prev) =>
      prev.filter((c) => {
        if (c.source === 'mine') return !inboxOk || waitingActors.has(c.profile.id);
        if (c.source === 'theirs') {
          return !pendingOthersOk || liveWaitPeerIds.has(c.profile.id);
        }
        return true;
      })
    );
  };

  const refreshMatches = useCallback(async () => {
    const accountId = user?.id ?? null;
    if (!accountId) return;
    const gen = ++genRef.current;
    inFlightRef.current = true;
    setInFlightTick((n) => n + 1);
    try {
      const result = await loadMatchesBoard({
        userId: accountId,
        departingIds: externalDeparting.current?.current ?? departingIdsRef.current,
        forceWait: restoredWaitActorsRef.current,
        extraTwoWay: twoWayDialogueRef.current,
        extraWrote: wroteFromMeRef.current,
      });
      if (gen !== genRef.current || accountRef.current !== accountId) return;
      setMyGender(result.myGender);
      setPeersWithChat(result.peersWithChat);
      setPeersIWroteTo(result.peersIWroteTo);
      setMatches((prev) =>
        retainDepartingMatches(
          prev,
          result.matches,
          externalDeparting.current?.current ?? departingIdsRef.current
        )
      );
      applyWaitPrune(result.waitPrune);
      try {
        const breaks = await fetchMatchBreaks();
        if (gen === genRef.current && accountRef.current === accountId) {
          setServerBrokenIds(new Set(breaks.map((row) => row.peer_id)));
        }
      } catch {
        /* la liste des matchs reste publiable */
      }
      if (gen !== genRef.current || accountRef.current !== accountId) return;
      loadedRef.current = true;
      setLoaded(true);
      setError(null);
    } catch (err) {
      warnSupabaseFailure('loadMatchesBoard', err);
      if (gen !== genRef.current || accountRef.current !== accountId) return;
      setError(userErrorMessage(err));
    } finally {
      if (gen === genRef.current) {
        inFlightRef.current = false;
        setInFlightTick((n) => n + 1);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    void refreshMatches();
  }, [refreshMatches, profileEpoch]);

  useInboxReload((detail) => {
    const decision = detail?.decision;
    if (
      decision === 'wait' ||
      decision === 'wait-dismiss' ||
      decision === 'reset'
    ) {
      return;
    }
    void refreshMatches();
  });

  useEffect(() => {
    const accountId = user?.id ?? null;
    if (!accountId) return;
    let timer: number | null = null;
    const schedule = (reason: 'visible' | 'online') => {
      const gate = {
        accountId,
        ready: loadedRef.current,
        wroteFromMe: [] as string[],
        wroteToMe: [] as string[],
        lastSentAt: {} as Record<string, number>,
      };
      if (
        !shouldRetryBellDialogue({
          accountId,
          gate,
          inFlight: inFlightRef.current,
          reason,
          visibilityState: document.visibilityState,
        })
      ) {
        return;
      }
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        if (
          !shouldRetryBellDialogue({
            accountId,
            gate: { ...gate, ready: loadedRef.current },
            inFlight: inFlightRef.current,
            reason,
            visibilityState: document.visibilityState,
          })
        ) {
          return;
        }
        void refreshMatches();
      }, 400);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule('visible');
    };
    const onOnline = () => schedule('online');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      if (timer != null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [user?.id, refreshMatches]);

  useEffect(() => {
    if (!loadedRef.current || !user) return;
    if (accountRef.current !== user.id) return;
    const broken = new Set([...serverBrokenIds, ...pageBrokenIds]);
    const next = matches
      .filter((match) => {
        if (broken.has(match.profile.id)) return false;
        if (match.waiting && isMineWaitArchived(user.id, match.profile.id)) {
          return false;
        }
        return true;
      })
      .map((match) => {
        const isPending = match.kind !== 'match';
        const isMatched = !isPending || match.alreadyLiked;
        const hasDialogue = peersWithChat.has(match.profile.id);
        let status: MatchesInboxStatus;
        if (match.waiting) status = 'wait';
        else if (isMatched) status = hasDialogue ? 'matched-chat' : 'matched';
        else status = 'new';
        return {
          id: match.profile.id,
          displayName: (match.profile.display_name || '').trim() || t('common.someone'),
          status,
          origin: match.origin,
        };
      });
    publish(next, user.id);
  }, [loaded, matches, peersWithChat, serverBrokenIds, pageBrokenIds, publish, user, t]);

  const invalidateMatchesLoad = useCallback(() => {
    genRef.current += 1;
  }, []);

  const setPageBrokenIds = useCallback((ids: Set<string>) => {
    setPageBrokenIdsState(ids);
  }, []);

  const bindWaitPrune = useCallback((fn: WaitPruneSetter | null) => {
    waitPruneRef.current = fn;
  }, []);

  const noteDeparting = useCallback((ref: MutableRefObject<Set<string>> | null) => {
    externalDeparting.current = ref;
  }, []);

  const value: MatchesBoardValue = {
    matches,
    setMatches,
    peersWithChat,
    setPeersWithChat,
    peersIWroteTo,
    setPeersIWroteTo,
    myGender,
    loaded,
    inFlight: inFlightRef.current,
    error,
    refreshMatches,
    invalidateMatchesLoad,
    twoWayDialogueRef,
    wroteFromMeRef,
    restoredWaitActorsRef,
    departingIdsRef,
    setPageBrokenIds,
    bindWaitPrune,
    noteDeparting,
  };

  return (
    <MatchesBoardContext.Provider value={value}>
      {children}
    </MatchesBoardContext.Provider>
  );
}

export function useMatchesBoard(): MatchesBoardValue {
  const ctx = useContext(MatchesBoardContext);
  if (!ctx) {
    throw new Error('useMatchesBoard hors du provider');
  }
  return ctx;
}
