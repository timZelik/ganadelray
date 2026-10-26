import type { HttpRequest } from './httpTypes.ts';

export function buildRequestUrl({ url, query }: Pick<HttpRequest, 'url' | 'query'>): URL {
  const requestUrl = new URL(url);
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined) requestUrl.searchParams.set(name, String(value));
  }
  return requestUrl;
}

export function buildRequestInit(request: HttpRequest, signal: AbortSignal): RequestInit {
  const headers = new Headers(request.headers);
  if (request.jsonBody !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const body = request.jsonBody !== undefined ? JSON.stringify(request.jsonBody) : request.rawBody;
  return { method: request.method, headers, signal, ...(body !== undefined ? { body, duplex: 'half' } : {}) } as RequestInit;
}
