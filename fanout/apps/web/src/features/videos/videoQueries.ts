import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient.ts';

const refreshIntervalMilliseconds = 4_000;
export const videosKey = ['videos'] as const;

export function useVideos() {
  return useQuery({ queryKey: videosKey, queryFn: apiClient.listVideos, refetchInterval: refreshIntervalMilliseconds });
}

export function useRetryPost() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: apiClient.retryPublishJob, onSuccess: () => queryClient.invalidateQueries({ queryKey: videosKey }) });
}
