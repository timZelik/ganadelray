import type { AuditLogEntry, ErrorKind } from '@fanout/domain';
import type { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/** Lets an adapter map platform-specific error payloads (e.g. Graph API code 190) to an error kind. */
export type ErrorResponseClassifier = (statusCode: number, body: unknown) => ErrorKind | null;

export interface HttpRequest<Schema extends z.ZodType = z.ZodType> {
  method: HttpMethod;
  url: string | URL;
  correlationId: string;
  connectionId?: string | null;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  jsonBody?: unknown;
  /** Raw body for uploads; never written to the audit log. */
  rawBody?: NonNullable<RequestInit['body']>;
  responseSchema?: Schema;
  timeoutMilliseconds?: number;
  /** POST is not retried on 5xx unless the endpoint is known to be idempotent; 429 is always retried. */
  idempotent?: boolean;
  classifyErrorResponse?: ErrorResponseClassifier;
  /** What the dry-run client returns in place of a real response, so multi-step flows run end to end. */
  dryRunResponse?: z.input<Schema>;
}

export interface HttpResponse<Body> {
  statusCode: number;
  headers: Headers;
  body: Body;
}

export interface HttpClient {
  request<Schema extends z.ZodType>(request: HttpRequest<Schema>): Promise<HttpResponse<z.output<Schema>>>;
}

export interface AuditSink {
  record(entry: AuditLogEntry): Promise<void>;
}
