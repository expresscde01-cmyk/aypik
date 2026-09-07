import { useCallback, useRef, useState } from 'react';
import {
  afterMatchCardOverlayClose,
  matchCardDepartDurationMs,
  waitMatchCardDepart,
} from '@/lib/matchCardDepart';

/** Une animation de départ, réutilisée par toutes les actions qui changent de rubrique. */
export function useMatchCardDepart() {
  const [departingIds, setDepartingIds] = useState<Set<string>>(() => new Set());
  const departingIdsRef = useRef<Set<string>>(departingIds);

  const playDepart = useCallback(
    async (profileId: string, commit?: () => void | Promise<void>) => {
      if (!profileId) {
        await commit?.();
        return;
      }
      setDepartingIds((prev) => {
        if (prev.has(profileId)) return prev;
        const next = new Set(prev);
        next.add(profileId);
        departingIdsRef.current = next;
        return next;
      });
      await afterMatchCardOverlayClose();
      await waitMatchCardDepart(matchCardDepartDurationMs());
      try {
        await commit?.();
      } finally {
        setDepartingIds((prev) => {
          if (!prev.has(profileId)) return prev;
          const next = new Set(prev);
          next.delete(profileId);
          departingIdsRef.current = next;
          return next;
        });
      }
    },
    []
  );

  const isDeparting = useCallback(
    (profileId: string) => departingIds.has(profileId),
    [departingIds]
  );

  return { playDepart, isDeparting, departingIdsRef };
}
