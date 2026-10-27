import type { PublishJobSummary } from '@fanout/database';
import { isRetryable } from '@fanout/domain';
import { jobIdentifiers } from '@fanout/queue';
import type { ApiDependencies } from './dependencies.ts';

export type RetryOutcome = { result: 'retried'; job: PublishJobSummary } | { result: 'not_found' } | { result: 'not_retryable'; status: string };

/** Puts a failed/skipped job back in the queue; preparation reuses any still-live rendition, so retries are cheap. */
export async function retryPublishJob({ publishJobRepository, queues, now }: ApiDependencies, publishJobId: string): Promise<RetryOutcome> {
  const existing = await publishJobRepository.findSummary(publishJobId);
  if (!existing) return { result: 'not_found' };
  if (!isRetryable(existing.status)) return { result: 'not_retryable', status: existing.status };
  const requeued = await publishJobRepository.transition(publishJobId, 'queued', { lastError: null, lastErrorKind: null, scheduledFor: existing.scheduledFor ?? now() });
  if (!requeued) return { result: 'not_retryable', status: existing.status };
  await queues.enqueuePrepare(publishJobId, { jobId: jobIdentifiers.retry(publishJobId, now().getTime()) });
  return { result: 'retried', job: (await publishJobRepository.findSummary(publishJobId))! };
}
