import { apiRoutes, listPublishJobsResponseSchema, retryPublishJobResponseSchema } from '@fanout/api-contract';
import type { PublishJobSummary } from '@fanout/database';
import { statusesThatCanTransitionTo, type PublishJobStatus } from '@fanout/domain';
import { createSilentLogger } from '@fanout/testing';
import { describe, expect, it } from 'vitest';
import type { ApiDependencies } from '../src/dependencies.ts';
import { buildApiServer } from '../src/server.ts';

const failedJobId = '11111111-1111-4111-8111-111111111111';
const publishedJobId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-10-26T12:00:00Z');

function buildSummary(id: string, status: PublishJobStatus): PublishJobSummary {
  return {
    id, status, workflowId: 'w', sourceItemId: 's', workflowDestinationId: 'd', idempotencyKey: id, dryRun: true, attemptCount: 1, scheduledFor: now,
    externalPostId: null, externalPostUrl: null, lastError: status === 'failed' ? 'Video is 2s; minimum is 3s' : null, lastErrorKind: status === 'failed' ? 'permanent' : null,
    requestPreview: { destination: 'tiktok' }, publishedAt: null, createdAt: now, updatedAt: now,
    workflowName: 'Hub', destinationKind: 'tiktok', publisherRoute: 'console', sourceItemTitle: 'Clip', sourceItemExternalId: 'clip.mp4@1-1',
  };
}

/** Faithful in-memory fake: transitions obey the same domain rules as the SQL compare-and-set. */
function buildFakeDependencies() {
  const summaries = new Map([failedJobId, publishedJobId].map((id, index) => [id, buildSummary(id, index === 0 ? 'failed' : 'published')]));
  const enqueued: Array<{ publishJobId: string; jobId?: string }> = [];
  const dependencies: ApiDependencies = {
    logger: createSilentLogger(),
    dryRun: true,
    now: () => now,
    queues: { enqueuePrepare: async (publishJobId, options) => void enqueued.push({ publishJobId, ...(options?.jobId ? { jobId: options.jobId } : {}) }) },
    publishJobRepository: {
      listSummaries: async ({ status }) => [...summaries.values()].filter((summary) => !status || summary.status === status),
      findSummary: async (id) => summaries.get(id) ?? null,
      async transition(id, to, changes = {}) {
        const current = summaries.get(id);
        if (!current || !statusesThatCanTransitionTo(to).includes(current.status)) return null;
        const { incrementAttemptCount: _increment, ...columns } = changes;
        const updated = { ...current, ...columns, status: to } as PublishJobSummary;
        summaries.set(id, updated);
        return updated;
      },
    },
  };
  return { dependencies, enqueued };
}

describe('publish job routes', () => {
  it('lists jobs in the contract shape, with retry availability', async () => {
    const server = await buildApiServer(buildFakeDependencies().dependencies);
    const response = await server.inject({ method: 'GET', url: apiRoutes.publishJobs });
    expect(response.statusCode).toBe(200);
    const { jobs } = listPublishJobsResponseSchema.parse(response.json());
    expect(jobs.map((job) => [job.id, job.canRetry])).toEqual([[failedJobId, true], [publishedJobId, false]]);
  });

  it('filters by status and rejects invalid query parameters', async () => {
    const server = await buildApiServer(buildFakeDependencies().dependencies);
    const filtered = await server.inject({ method: 'GET', url: `${apiRoutes.publishJobs}?status=failed` });
    expect(filtered.json().jobs).toHaveLength(1);
    expect((await server.inject({ method: 'GET', url: `${apiRoutes.publishJobs}?status=exploded` })).statusCode).toBe(400);
    expect((await server.inject({ method: 'GET', url: `${apiRoutes.publishJobs}?limit=5000` })).statusCode).toBe(400);
  });

  it('retries a failed job: clears the error, requeues it under a fresh queue job ID', async () => {
    const { dependencies, enqueued } = buildFakeDependencies();
    const server = await buildApiServer(dependencies);
    const response = await server.inject({ method: 'POST', url: apiRoutes.retryPublishJob(failedJobId) });
    expect(response.statusCode).toBe(200);
    const { job } = retryPublishJobResponseSchema.parse(response.json());
    expect(job).toMatchObject({ status: 'queued', lastError: null, canRetry: false });
    expect(enqueued).toEqual([{ publishJobId: failedJobId, jobId: `prepare-${failedJobId}-retry-${now.getTime()}` }]);
  });

  it('refuses to retry a published job, and 404s unknown or malformed IDs', async () => {
    const server = await buildApiServer(buildFakeDependencies().dependencies);
    expect((await server.inject({ method: 'POST', url: apiRoutes.retryPublishJob(publishedJobId) })).statusCode).toBe(409);
    expect((await server.inject({ method: 'POST', url: apiRoutes.retryPublishJob('33333333-3333-4333-8333-333333333333') })).statusCode).toBe(404);
    expect((await server.inject({ method: 'GET', url: apiRoutes.publishJob('not-a-uuid') })).statusCode).toBe(400);
  });

  it('reports health and dry-run mode', async () => {
    const server = await buildApiServer(buildFakeDependencies().dependencies);
    expect((await server.inject({ method: 'GET', url: apiRoutes.health })).json()).toEqual({ status: 'ok', dryRun: true });
  });
});
