import { redactSecrets, redactUrl } from '@fanout/logging';
import type { AuditLogEntry } from '@fanout/domain';
import type { HttpRequest } from './httpTypes.ts';

const maximumAuditedBodyCharacters = 10_000;

function truncateForAudit(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || serialized.length <= maximumAuditedBodyCharacters) return value;
  return `${serialized.slice(0, maximumAuditedBodyCharacters)}…[truncated]`;
}

function describeRequestBody(request: HttpRequest): unknown {
  if (request.rawBody !== undefined) return '[binary body omitted]';
  return request.jsonBody === undefined ? null : truncateForAudit(redactSecrets(request.jsonBody));
}

export interface AuditEntryInput {
  request: HttpRequest;
  url: URL;
  statusCode: number | null;
  latencyMilliseconds: number;
  responseBody: unknown;
}

export function buildAuditEntry({ request, url, statusCode, latencyMilliseconds, responseBody }: AuditEntryInput): AuditLogEntry {
  return {
    correlationId: request.correlationId,
    connectionId: request.connectionId ?? null,
    method: request.method,
    endpoint: redactUrl(url.toString()),
    statusCode,
    latencyMilliseconds,
    redactedRequestBody: describeRequestBody(request),
    redactedResponseBody: truncateForAudit(redactSecrets(responseBody)),
  };
}

/** The exact request a publisher would send, safe to show in the dashboard. */
export function buildRequestPreview(request: HttpRequest, url: URL): Record<string, unknown> {
  return {
    method: request.method,
    url: redactUrl(url.toString()),
    headers: redactSecrets(request.headers ?? {}),
    body: describeRequestBody(request),
  };
}
