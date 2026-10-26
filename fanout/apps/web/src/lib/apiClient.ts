import { apiRoutes, errorResponseSchema, healthResponseSchema, listPublishJobsResponseSchema, retryPublishJobResponseSchema, type ListPublishJobsQuery } from '@fanout/api-contract';
import type { z } from 'zod';

export class ApiRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function requestJson<Schema extends z.ZodType>(path: string, schema: Schema, init?: RequestInit, origin = globalThis.location?.origin ?? 'http://localhost'): Promise<z.output<Schema>> {
  const response = await fetch(new URL(path, origin), { headers: { accept: 'application/json' }, ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiRequestError(errorResponseSchema.safeParse(body).data?.error ?? `Request failed (${response.status})`, response.status);
  return schema.parse(body);
}

function withQuery(path: string, query: Record<string, string | number | undefined>): string {
  const parameters = new URLSearchParams(Object.entries(query).flatMap(([name, value]) => (value === undefined ? [] : [[name, String(value)]])));
  return parameters.size > 0 ? `${path}?${parameters}` : path;
}

/** Every response is validated against the same contract the API serializes with. */
export function createApiClient(origin?: string) {
  return {
    getHealth: () => requestJson(apiRoutes.health, healthResponseSchema, undefined, origin),
    listPublishJobs: (query: ListPublishJobsQuery = {}) => requestJson(withQuery(apiRoutes.publishJobs, query), listPublishJobsResponseSchema, undefined, origin),
    retryPublishJob: (publishJobId: string) => requestJson(apiRoutes.retryPublishJob(publishJobId), retryPublishJobResponseSchema, { method: 'POST' }, origin),
  };
}

export const apiClient = createApiClient();
