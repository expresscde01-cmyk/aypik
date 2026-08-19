import { QueryClient } from '@tanstack/react-query';

export const QUERY_STALE_MS = 60_000;
export const QUERY_GC_MS = 5 * 60_000;
export const SIGNUP_COUNT_STALE_MS = 5 * 60_000;

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_MS,
        gcTime: QUERY_GC_MS,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });
}

export const queryKeys = {
  signupCount: () => ['platform-signup-count'] as const,
  discoverViewer: (userId: string | undefined, epoch: number) =>
    ['discover-viewer', userId, epoch] as const,
  discoveryCatalog: (
    userId: string | undefined,
    prefsKey: string,
    sort: string,
    createdAfter: string | null,
    epoch: number,
    visitEpoch = 0
  ) =>
    [
      'suggest-profiles',
      'discover',
      userId,
      prefsKey,
      sort,
      createdAfter,
      epoch,
      visitEpoch,
    ] as const,
  homeSuggestions: (
    userId: string | undefined,
    prefsEpoch: number,
    profileEpoch: number
  ) =>
    ['suggest-profiles', 'home', userId, prefsEpoch, profileEpoch] as const,
};
