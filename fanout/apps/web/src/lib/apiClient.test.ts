import { apiRoutes, type PublishJobView } from '@fanout/api-contract';
import { useMockServer } from '@fanout/testing';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ApiRequestError, createApiClient } from './apiClient.ts';
import { formatRelativeTime } from './formatting.ts';

const origin = 'http://api.test';
const server = useMockServer();
const client = createApiClient(origin);

const job: PublishJobView = {
  id: '11111111-1111-4111-8111-111111111111', status: 'failed', dryRun: true, attemptCount: 1, destinationKind: 'tiktok', publisherRoute: 'console',
  workflowName: 'Hub', sourceItemTitle: 'Clip', sourceItemExternalId: 'clip.mp4', scheduledFor: null, publishedAt: null, externalPostId: null,
  externalPostUrl: null, lastError: 'too short', lastErrorKind: 'permanent', requestPreview: null, createdAt: '2026-10-26T12:00:00.000Z', updatedAt: '2026-10-26T12:00:00.000Z', canRetry: true,
};

describe('api client', () => {
  it('sends filters as query parameters and validates the response against the contract', async () => {
    server.use(http.get(`${origin}${apiRoutes.publishJobs}`, ({ request }) => {
      expect(new URL(request.url).searchParams.get('status')).toBe('failed');
      return HttpResponse.json({ jobs: [job] });
    }));
    expect((await client.listPublishJobs({ status: 'failed' })).jobs).toEqual([job]);
  });

  it('rejects responses that drift from the contract', async () => {
    server.use(http.get(`${origin}${apiRoutes.publishJobs}`, () => HttpResponse.json({ jobs: [{ ...job, status: 'exploded' }] })));
    await expect(client.listPublishJobs()).rejects.toThrow();
  });

  it('surfaces the API error message and status code', async () => {
    server.use(http.post(`${origin}${apiRoutes.retryPublishJob(job.id)}`, () => HttpResponse.json({ error: 'A published job cannot be retried' }, { status: 409 })));
    const error = await client.retryPublishJob(job.id).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ message: 'A published job cannot be retried', statusCode: 409 });
  });
});

describe('formatRelativeTime', () => {
  it('picks the largest sensible unit', () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    expect(formatRelativeTime('2026-10-26T11:58:00Z', now)).toBe('2 minutes ago');
    expect(formatRelativeTime('2026-10-26T12:00:00Z', now)).toBe('now');
  });
});
