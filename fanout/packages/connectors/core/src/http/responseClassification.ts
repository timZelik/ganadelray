import { PermanentError, ReauthRequiredError, RetryableError, type ErrorKind, type PipelineError } from '@fanout/domain';
import type { ErrorResponseClassifier } from './httpTypes.ts';

export function defaultErrorKindForStatus(statusCode: number): ErrorKind {
  if (statusCode === 401) return 'reauth_required';
  if (statusCode === 408 || statusCode === 429 || statusCode >= 500) return 'retryable';
  return 'permanent';
}

export function classifyResponse(statusCode: number, body: unknown, classifier?: ErrorResponseClassifier): ErrorKind {
  return classifier?.(statusCode, body) ?? defaultErrorKindForStatus(statusCode);
}

export interface ErrorFactoryInput {
  kind: ErrorKind;
  message: string;
  connectionId: string | null;
  retryAfterMilliseconds: number | null;
  cause?: unknown;
}

export function createTypedError({ kind, message, connectionId, retryAfterMilliseconds, cause }: ErrorFactoryInput): PipelineError {
  if (kind === 'reauth_required') return new ReauthRequiredError(message, { cause, ...(connectionId ? { connectionId } : {}) });
  if (kind === 'permanent') return new PermanentError(message, { cause });
  return new RetryableError(message, { cause, ...(retryAfterMilliseconds !== null ? { retryAfterMilliseconds } : {}) });
}
