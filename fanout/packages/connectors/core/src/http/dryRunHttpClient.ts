import { PermanentError } from '@fanout/domain';
import type { Logger } from '@fanout/logging';
import { buildRequestPreview } from './auditRecording.ts';
import type { HttpClient, HttpRequest, HttpResponse } from './httpTypes.ts';
import { buildRequestUrl } from './requestUrl.ts';

export interface DryRunHttpClient extends HttpClient {
  recordedRequests(): Record<string, unknown>[];
}

function syntheticBody(request: HttpRequest): unknown {
  if (!request.responseSchema) return request.dryRunResponse ?? null;
  const parsed = request.responseSchema.safeParse(request.dryRunResponse);
  if (parsed.success) return parsed.data;
  throw new PermanentError(`Dry run of ${request.method} ${String(request.url)} needs a dryRunResponse matching its response schema`);
}

/** Records the exact request instead of sending it, and answers with the publisher-supplied synthetic response. */
export function createDryRunHttpClient(logger: Logger): DryRunHttpClient {
  const recorded: Record<string, unknown>[] = [];
  async function request(httpRequest: HttpRequest): Promise<HttpResponse<unknown>> {
    const preview = buildRequestPreview(httpRequest, buildRequestUrl(httpRequest));
    recorded.push(preview);
    logger.info({ correlationId: httpRequest.correlationId, dryRunRequest: preview }, 'Dry run: request recorded, not sent');
    return { statusCode: 200, headers: new Headers(), body: syntheticBody(httpRequest) };
  }
  return { request, recordedRequests: () => [...recorded] } as DryRunHttpClient;
}
