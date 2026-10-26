import { PermanentError, ReauthRequiredError, RetryableError } from '@fanout/domain';
import { createRecordingAuditSink, createSilentLogger, useMockServer } from '@fanout/testing';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createDryRunHttpClient, createHttpClient } from '../src/index.ts';

const server = useMockServer();
const endpoint = 'https://platform.test/v1/posts';
const postResponseSchema = z.object({ id: z.string() });

function buildClient() {
  const auditSink = createRecordingAuditSink();
  const sleeps: number[] = [];
  const client = createHttpClient({
    auditSink,
    logger: createSilentLogger(),
    sleep: async (milliseconds) => void sleeps.push(milliseconds),
    backoff: { baseDelayMilliseconds: 100, maximumDelayMilliseconds: 5_000 },
  });
  return { client, auditSink, sleeps };
}

function respondInSequence(...responses: Array<() => Response>) {
  let callCount = 0;
  return () => responses[Math.min(callCount++, responses.length - 1)]!();
}

describe('createHttpClient', () => {
  it('returns the schema-validated body on success and audits the call with secrets redacted', async () => {
    server.use(http.post(endpoint, () => HttpResponse.json({ id: 'post-1', access_token: 'leaked?' })));
    const { client, auditSink } = buildClient();
    const response = await client.request({
      method: 'POST', url: endpoint, query: { access_token: 'secret' }, correlationId: 'correlation-1',
      jsonBody: { caption: 'hi', apiKey: 'secret' }, responseSchema: postResponseSchema,
    });
    expect(response.body).toEqual({ id: 'post-1' });
    expect(auditSink.entries).toHaveLength(1);
    const [entry] = auditSink.entries;
    expect(entry).toMatchObject({ correlationId: 'correlation-1', method: 'POST', statusCode: 200 });
    expect(entry!.endpoint).toBe(`${endpoint}?access_token=[REDACTED]`);
    expect(entry!.redactedRequestBody).toEqual({ caption: 'hi', apiKey: '[REDACTED]' });
    expect(JSON.stringify(entry)).not.toContain('secret');
  });

  it('retries 429 even for POST, honouring Retry-After', async () => {
    server.use(http.post(endpoint, respondInSequence(
      () => new HttpResponse(null, { status: 429, headers: { 'retry-after': '2' } }),
      () => HttpResponse.json({ id: 'post-2' }),
    )));
    const { client, sleeps, auditSink } = buildClient();
    const response = await client.request({ method: 'POST', url: endpoint, correlationId: 'c', responseSchema: postResponseSchema });
    expect(response.body.id).toBe('post-2');
    expect(sleeps).toEqual([2000]);
    expect(auditSink.entries.map((entry) => entry.statusCode)).toEqual([429, 200]);
  });

  it('retries 5xx with exponential backoff for idempotent requests, then raises RetryableError', async () => {
    server.use(http.get(endpoint, () => new HttpResponse('upstream down', { status: 503 })));
    const { client, sleeps } = buildClient();
    await expect(client.request({ method: 'GET', url: endpoint, correlationId: 'c' })).rejects.toBeInstanceOf(RetryableError);
    expect(sleeps).toHaveLength(3);
    sleeps.forEach((delay, index) => expect(delay).toBeLessThanOrEqual(100 * 2 ** index));
  });

  it('does not retry a non-idempotent POST on 5xx, to avoid double posting', async () => {
    server.use(http.post(endpoint, () => new HttpResponse(null, { status: 500 })));
    const { client, auditSink } = buildClient();
    await expect(client.request({ method: 'POST', url: endpoint, correlationId: 'c' })).rejects.toBeInstanceOf(RetryableError);
    expect(auditSink.entries).toHaveLength(1);
  });

  it('hands a Retry-After longer than the backoff ceiling back to the queue instead of sleeping', async () => {
    server.use(http.get(endpoint, () => new HttpResponse(null, { status: 429, headers: { 'retry-after': '3600' } })));
    const { client, sleeps } = buildClient();
    const error = await client.request({ method: 'GET', url: endpoint, correlationId: 'c' }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RetryableError);
    expect((error as RetryableError).retryAfterMilliseconds).toBe(3_600_000);
    expect(sleeps).toEqual([]);
  });

  it('maps 401 (token expired) to ReauthRequiredError carrying the connection', async () => {
    server.use(http.get(endpoint, () => HttpResponse.json({ error: 'expired' }, { status: 401 })));
    const { client } = buildClient();
    const error = await client.request({ method: 'GET', url: endpoint, correlationId: 'c', connectionId: 'connection-9' }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ReauthRequiredError);
    expect((error as ReauthRequiredError).connectionId).toBe('connection-9');
  });

  it('lets an adapter reclassify platform-specific error payloads', async () => {
    server.use(http.get(endpoint, () => HttpResponse.json({ error: { code: 190 } }, { status: 400 })));
    const { client } = buildClient();
    const classifyErrorResponse = (_status: number, body: unknown) => (JSON.stringify(body).includes('190') ? 'reauth_required' as const : null);
    await expect(client.request({ method: 'GET', url: endpoint, correlationId: 'c', classifyErrorResponse })).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it('treats other 4xx and unexpected response shapes as permanent', async () => {
    server.use(http.get(endpoint, () => HttpResponse.json({ error: 'bad request' }, { status: 400 })));
    const { client } = buildClient();
    await expect(client.request({ method: 'GET', url: endpoint, correlationId: 'c' })).rejects.toBeInstanceOf(PermanentError);
    server.use(http.get(endpoint, () => HttpResponse.json({ unexpected: true })));
    await expect(client.request({ method: 'GET', url: endpoint, correlationId: 'c', responseSchema: postResponseSchema })).rejects.toThrow(/unexpected response shape/);
  });

  it('times out slow platforms as a retryable failure', async () => {
    server.use(http.get(endpoint, async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return HttpResponse.json({ id: 'late' });
    }));
    const { client, auditSink } = buildClient();
    await expect(client.request({ method: 'GET', url: endpoint, correlationId: 'c', timeoutMilliseconds: 20, idempotent: false })).rejects.toBeInstanceOf(RetryableError);
    expect(auditSink.entries[0]!.statusCode).toBeNull();
  });
});

describe('createDryRunHttpClient', () => {
  it('records the exact request and answers with the synthetic response, never touching the network', async () => {
    const client = createDryRunHttpClient(createSilentLogger());
    const response = await client.request({
      method: 'POST', url: endpoint, correlationId: 'c', headers: { Authorization: 'Bearer secret' },
      jsonBody: { caption: 'hello' }, responseSchema: postResponseSchema, dryRunResponse: { id: 'dry-run-post' },
    });
    expect(response.body.id).toBe('dry-run-post');
    expect(client.recordedRequests()).toEqual([
      { method: 'POST', url: endpoint, headers: { Authorization: '[REDACTED]' }, body: { caption: 'hello' } },
    ]);
  });

  it('refuses to invent a response the publisher did not supply', async () => {
    const client = createDryRunHttpClient(createSilentLogger());
    await expect(client.request({ method: 'GET', url: endpoint, correlationId: 'c', responseSchema: postResponseSchema })).rejects.toBeInstanceOf(PermanentError);
  });
});
