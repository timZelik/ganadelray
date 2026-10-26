export const errorKinds = ['retryable', 'permanent', 'reauth_required'] as const;
export type ErrorKind = (typeof errorKinds)[number];

/** Base for every error the pipeline understands; the queue's retry policy is driven by `kind`. */
export abstract class PipelineError extends Error {
  abstract readonly kind: ErrorKind;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Transient failure (429, 5xx, timeouts): try again with backoff. */
export class RetryableError extends PipelineError {
  readonly kind = 'retryable';
  readonly retryAfterMilliseconds: number | null;

  constructor(message: string, options?: ErrorOptions & { retryAfterMilliseconds?: number }) {
    super(message, options);
    this.retryAfterMilliseconds = options?.retryAfterMilliseconds ?? null;
  }
}

/** The request can never succeed as-is (validation, 4xx): fail the job without retrying. */
export class PermanentError extends PipelineError {
  readonly kind = 'permanent';
}

/** The connection's credentials are no longer valid: fail the job and flag the connection. */
export class ReauthRequiredError extends PipelineError {
  readonly kind = 'reauth_required';
  readonly connectionId: string | null;

  constructor(message: string, options?: ErrorOptions & { connectionId?: string }) {
    super(message, options);
    this.connectionId = options?.connectionId ?? null;
  }
}

/** Unknown errors are treated as retryable: a bug should not silently drop a post. */
export function classifyError(error: unknown): ErrorKind {
  return error instanceof PipelineError ? error.kind : 'retryable';
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
