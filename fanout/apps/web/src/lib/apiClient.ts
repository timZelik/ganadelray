import {
  apiRoutes, connectBufferRequestSchema, errorResponseSchema, healthResponseSchema, listPublishJobsResponseSchema, listVideosResponseSchema, platformsResponseSchema,
  retryPublishJobResponseSchema, sessionResponseSchema, uploadFormFields, uploadResponseSchema, uploadStatusResponseSchema,
  type FitMode, type ListPublishJobsQuery, type UpdateDestinationRequest,
} from '@fanout/api-contract';
import type { z } from 'zod';

export class ApiRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

function errorMessageFrom(body: unknown, statusCode: number): string {
  return errorResponseSchema.safeParse(body).data?.error ?? `Something went wrong (${statusCode}). Please try again.`;
}

async function requestJson<Schema extends z.ZodType>(path: string, schema: Schema, init?: RequestInit, origin = globalThis.location?.origin ?? 'http://localhost'): Promise<z.output<Schema>> {
  const hasJsonBody = typeof init?.body === 'string';
  const response = await fetch(new URL(path, origin), {
    credentials: 'include',
    ...init,
    headers: { accept: 'application/json', ...(hasJsonBody ? { 'content-type': 'application/json' } : {}), ...init?.headers },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiRequestError(errorMessageFrom(body, response.status), response.status);
  return schema.parse(body);
}

function withQuery(path: string, query: Record<string, string | number | undefined>): string {
  const parameters = new URLSearchParams(Object.entries(query).flatMap(([name, value]) => (value === undefined ? [] : [[name, String(value)]])));
  return parameters.size > 0 ? `${path}?${parameters}` : path;
}

const sendJson = (method: string, body?: unknown): RequestInit => ({ method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

export interface VideoUpload {
  file: File;
  caption: string;
  title: string;
  onProgress(fraction: number): void;
}

/** XMLHttpRequest rather than fetch: it is the only browser API that reports upload progress. */
function uploadWithProgress({ file, caption, title, onProgress }: VideoUpload): Promise<string> {
  const form = new FormData();
  form.append(uploadFormFields.caption, caption);
  form.append(uploadFormFields.title, title);
  form.append(uploadFormFields.file, file);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', apiRoutes.videos);
    request.withCredentials = true;
    request.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    request.onerror = () => reject(new ApiRequestError('The upload was interrupted. Check your connection and try again.', 0));
    request.onload = () => {
      const body: unknown = (() => { try { return JSON.parse(request.responseText); } catch { return null; } })();
      if (request.status >= 400) return reject(new ApiRequestError(errorMessageFrom(body, request.status), request.status));
      resolve(uploadResponseSchema.parse(body).uploadId);
    };
    request.send(form);
  });
}

/** Every response is validated against the same contract the API serializes with. */
export function createApiClient(origin?: string) {
  return {
    getHealth: () => requestJson(apiRoutes.health, healthResponseSchema, undefined, origin),
    getSession: () => requestJson(apiRoutes.session, sessionResponseSchema, undefined, origin),
    listPublishJobs: (query: ListPublishJobsQuery = {}) => requestJson(withQuery(apiRoutes.publishJobs, query), listPublishJobsResponseSchema, undefined, origin),
    retryPublishJob: (publishJobId: string) => requestJson(apiRoutes.retryPublishJob(publishJobId), retryPublishJobResponseSchema, { method: 'POST' }, origin),
    listVideos: () => requestJson(apiRoutes.videos, listVideosResponseSchema, undefined, origin),
    uploadVideo: uploadWithProgress,
    getUploadStatus: (uploadId: string) => requestJson(apiRoutes.uploadStatus(uploadId), uploadStatusResponseSchema, undefined, origin),
    getPlatforms: () => requestJson(apiRoutes.platforms, platformsResponseSchema, undefined, origin),
    connectBuffer: (apiKey: string) => requestJson(apiRoutes.bufferConnection, platformsResponseSchema, sendJson('PUT', connectBufferRequestSchema.parse({ apiKey })), origin),
    disconnectBuffer: () => requestJson(apiRoutes.bufferConnection, platformsResponseSchema, sendJson('DELETE'), origin),
    updateDestination: (destinationId: string, changes: UpdateDestinationRequest) => requestJson(apiRoutes.destination(destinationId), platformsResponseSchema, sendJson('PATCH', changes), origin),
    updateFitMode: (fitMode: FitMode) => requestJson(apiRoutes.fitMode, platformsResponseSchema, sendJson('PUT', { fitMode }), origin),
  };
}

export const apiClient = createApiClient();
