import type { PlatformsResponse } from '@fanout/api-contract';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient.ts';

export const platformsQuery = queryOptions({ queryKey: ['platforms'], queryFn: apiClient.getPlatforms });

/** Every settings change returns the full, fresh settings, so the cache is replaced rather than refetched. */
export function usePlatformMutation<Variables>(mutationFn: (variables: Variables) => Promise<PlatformsResponse>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: (settings) => queryClient.setQueryData(platformsQuery.queryKey, settings) });
}
