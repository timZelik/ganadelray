import { PermanentError, RetryableError, type PipelineError } from '@fanout/domain';
import { redactSecrets, redactUrl, type Logger } from '@fanout/logging';
import { buildAuditEntry } from './auditRecording.ts';
import type { AuditSink, HttpClient, HttpRequest, HttpResponse } from './httpTypes.ts';
import { buildRequestInit, buildRequestUrl } from './requestUrl.ts';
import { classifyResponse, createTypedError } from './responseClassification.ts';
import { computeBackoffMilliseconds, parseRetryAfterMilliseconds, type BackoffSettings } from './retryDelay.ts';

export interface HttpClientOptions {
  auditSink: AuditSink;
  logger: Logger;
  maximumAttempts?: number;
  defaultTimeoutMilliseconds?: number;
  backoff?: BackoffSettings;
  sleep?: (milliseconds: number) => Promise<void>;
  fetchImplementation?: typeof fetch;
}

type ClientSettings = Required<HttpClientOptions>;

type AttemptOutcome =
  | { succeeded: true; response: HttpResponse<unknown> }
  | { succeeded: false; error: PipelineError; statusCode: number | null; retryAfterMilliseconds: number | null };

const idempotentMethods = new Set(['GET', 'HEAD', 'PUT', 'DELETE']);

const defaultSettings = {
  maximumAttempts: 4,
  defaultTimeoutMilliseconds: 30_000,
  backoff: { baseDelayMilliseconds: 500, maximumDelayMilliseconds: 30_000 },
  sleep: (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  fetchImplementation: (...fetchArguments: Parameters<typeof fetch>) => fetch(...fetchArguments),
};

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return null;
  const isJson = response.headers.get('content-type')?.includes('json') ?? false;
  if (!isJson) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function describeFailure(request: HttpRequest, url: URL, statusCode: number | null, body: unknown): string {
  const summary = statusCode === null ? 'did not complete' : `failed with HTTP ${statusCode}`;
  const detail = body === null || body === undefined ? '' : `: ${JSON.stringify(redactSecrets(body)).slice(0, 500)}`;
  return `${request.method} ${redactUrl(url.origin + url.pathname)} ${summary}${detail}`;
}

function parseSuccessfulBody(request: HttpRequest, url: URL, body: unknown): unknown {
  if (!request.responseSchema) return body;
  const parsed = request.responseSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  throw new PermanentError(`${describeFailure(request, url, 200, null)} returned an unexpected response shape: ${parsed.error.message}`);
}

async function recordAudit(settings: ClientSettings, entry: Parameters<AuditSink['record']>[0]): Promise<void> {
  try {
    await settings.auditSink.record(entry);
  } catch (auditError) {
    settings.logger.warn({ err: auditError, correlationId: entry.correlationId }, 'Audit log write failed');
  }
}

async function attemptRequest(request: HttpRequest, url: URL, settings: ClientSettings): Promise<AttemptOutcome> {
  const startedAt = performance.now();
  const signal = AbortSignal.timeout(request.timeoutMilliseconds ?? settings.defaultTimeoutMilliseconds);
  const connectionId = request.connectionId ?? null;
  let response: Response;
  try {
    response = await settings.fetchImplementation(url, buildRequestInit(request, signal));
  } catch (networkError) {
    await recordAudit(settings, buildAuditEntry({ request, url, statusCode: null, latencyMilliseconds: performance.now() - startedAt, responseBody: String(networkError) }));
    const error = new RetryableError(describeFailure(request, url, null, String(networkError)), { cause: networkError });
    return { succeeded: false, error, statusCode: null, retryAfterMilliseconds: null };
  }
  const body = await readResponseBody(response);
  await recordAudit(settings, buildAuditEntry({ request, url, statusCode: response.status, latencyMilliseconds: performance.now() - startedAt, responseBody: body }));
  if (response.ok) return { succeeded: true, response: { statusCode: response.status, headers: response.headers, body: parseSuccessfulBody(request, url, body) } };
  const retryAfterMilliseconds = parseRetryAfterMilliseconds(response.headers.get('retry-after'));
  const kind = classifyResponse(response.status, body, request.classifyErrorResponse);
  const error = createTypedError({ kind, message: describeFailure(request, url, response.status, body), connectionId, retryAfterMilliseconds });
  return { succeeded: false, error, statusCode: response.status, retryAfterMilliseconds };
}

function isReplayable(request: HttpRequest): boolean {
  return !(request.rawBody instanceof ReadableStream);
}

/** 429 means "not processed", so it is always safe to retry; anything else only for idempotent requests. */
function isSafeToRetry(request: HttpRequest, statusCode: number | null): boolean {
  if (!isReplayable(request)) return false;
  if (statusCode === 429) return true;
  return request.idempotent ?? idempotentMethods.has(request.method);
}

function retryDelayFor(request: HttpRequest, failure: Extract<AttemptOutcome, { succeeded: false }>, attemptNumber: number, settings: ClientSettings): number | null {
  const canRetry = failure.error.kind === 'retryable' && attemptNumber < settings.maximumAttempts && isSafeToRetry(request, failure.statusCode);
  if (!canRetry) return null;
  const delay = failure.retryAfterMilliseconds ?? computeBackoffMilliseconds(attemptNumber, settings.backoff);
  // A long Retry-After should reschedule the queue job, not park a worker.
  return delay > settings.backoff.maximumDelayMilliseconds ? null : delay;
}

/** The one HTTP wrapper every external call goes through: timeouts, retries with backoff, audit log, typed errors. */
export function createHttpClient(options: HttpClientOptions): HttpClient {
  const settings: ClientSettings = { ...defaultSettings, ...options };
  async function request(httpRequest: HttpRequest): Promise<HttpResponse<unknown>> {
    const url = buildRequestUrl(httpRequest);
    for (let attemptNumber = 1; ; attemptNumber += 1) {
      const outcome = await attemptRequest(httpRequest, url, settings);
      if (outcome.succeeded) return outcome.response;
      const delay = retryDelayFor(httpRequest, outcome, attemptNumber, settings);
      if (delay === null) throw outcome.error;
      settings.logger.warn({ correlationId: httpRequest.correlationId, attemptNumber, delay, statusCode: outcome.statusCode }, 'Retrying external request');
      await settings.sleep(delay);
    }
  }
  return { request } as HttpClient;
}
