import { classifyError, describeError, RetryableError, type ErrorKind } from '@fanout/domain';
import { DelayedError, UnrecoverableError, type Job } from 'bullmq';

export interface FinalFailure {
  error: unknown;
  kind: ErrorKind;
  message: string;
}

export interface ErrorPolicyHooks {
  /** Persist the failure (job row → failed, connection → needs_reauth) once no retries remain. */
  onFinalFailure(failure: FinalFailure): Promise<void>;
  /** Record that a retryable failure happened and another attempt is coming. */
  onRetryScheduled?(failure: FinalFailure): Promise<void>;
}

function hasRetriesLeft(job: Job): boolean {
  return job.attemptsMade + 1 < (job.opts.attempts ?? 1);
}

/**
 * The single place error types drive queue behaviour:
 * permanent / reauth → fail now without retrying; retryable → BullMQ retries until attempts run out.
 */
export async function runWithErrorPolicy<Result>(job: Job, hooks: ErrorPolicyHooks, handler: () => Promise<Result>): Promise<Result> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof DelayedError) throw error;
    const kind = classifyError(error);
    const message = describeError(error);
    if (kind !== 'retryable' || !hasRetriesLeft(job)) {
      await hooks.onFinalFailure({ error, kind, message });
      throw kind === 'retryable' ? error : new UnrecoverableError(message);
    }
    await hooks.onRetryScheduled?.({ error, kind, message });
    throw error;
  }
}

/** Custom backoff: honour a platform's Retry-After when the error carries one, else exponential from 5s. */
export function retryAfterAwareBackoff(attemptsMade: number, _type?: string, error?: Error): number {
  if (error instanceof RetryableError && error.retryAfterMilliseconds !== null) return error.retryAfterMilliseconds;
  return Math.min(5_000 * 2 ** Math.max(0, attemptsMade - 1), 15 * 60 * 1000);
}

/** Parks a job until `timestamp` without counting an attempt (rate limits, scheduled posts). */
export async function delayJobUntil(job: Job, token: string | undefined, timestamp: number): Promise<never> {
  await job.moveToDelayed(timestamp, token);
  throw new DelayedError();
}
