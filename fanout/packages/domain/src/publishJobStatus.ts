import { z } from 'zod';
import { PermanentError } from './errors.ts';

export const publishJobStatuses = ['queued', 'preparing', 'publishing', 'processing', 'published', 'failed', 'skipped'] as const;
export const publishJobStatusSchema = z.enum(publishJobStatuses);
export type PublishJobStatus = z.infer<typeof publishJobStatusSchema>;

const allowedTransitions: Record<PublishJobStatus, readonly PublishJobStatus[]> = {
  queued: ['preparing', 'skipped', 'failed'],
  preparing: ['publishing', 'failed', 'skipped', 'queued'],
  publishing: ['processing', 'published', 'failed', 'queued'],
  processing: ['published', 'failed'],
  published: [],
  failed: ['queued'],
  skipped: ['queued'],
};

export const terminalPublishJobStatuses: readonly PublishJobStatus[] = ['published', 'failed', 'skipped'];
export const retryablePublishJobStatuses: readonly PublishJobStatus[] = ['failed', 'skipped'];

export function canTransition(from: PublishJobStatus, to: PublishJobStatus): boolean {
  return allowedTransitions[from].includes(to);
}

/** Statuses a job may be in for a move to `to` to be legal; repositories use this for atomic compare-and-set updates. */
export function statusesThatCanTransitionTo(to: PublishJobStatus): PublishJobStatus[] {
  return publishJobStatuses.filter((from) => canTransition(from, to));
}

export function assertTransition(from: PublishJobStatus, to: PublishJobStatus): void {
  if (!canTransition(from, to)) throw new PermanentError(`Publish job cannot move from "${from}" to "${to}"`);
}

export function isRetryable(status: PublishJobStatus): boolean {
  return retryablePublishJobStatuses.includes(status);
}
