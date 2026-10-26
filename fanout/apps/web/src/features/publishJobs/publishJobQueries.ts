import type { PublishJobStatus } from '@fanout/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient.ts';

const refreshIntervalMilliseconds = 3_000;
const publishJobsKey = ['publish-jobs'] as const;

export function usePublishJobs(status: PublishJobStatus | undefined) {
  return useQuery({
    queryKey: [...publishJobsKey, status ?? 'all'],
    queryFn: () => apiClient.listPublishJobs({ status, limit: 100 }),
    refetchInterval: refreshIntervalMilliseconds,
  });
}

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: apiClient.getHealth, staleTime: 60_000 });
}

export function useRetryPublishJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.retryPublishJob,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: publishJobsKey }),
  });
}
