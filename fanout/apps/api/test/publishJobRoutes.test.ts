import { apiRoutes, listPublishJobsResponseSchema, retryPublishJobResponseSchema } from '@fanout/api-contract';
import { describe, expect, it } from 'vitest';
import { buildFakeApiDependencies, buildSummary, now, signedIn } from './fakeApiDependencies.ts';
import { buildApiServer } from '../src/server.ts';

const failedJobId = '11111111-1111-4111-8111-111111111111';
const publishedJobId = '22222222-2222-4222-8222-222222222222';

function buildFakeDependencies() {
  const fake = buildFakeApiDependencies();
  fake.summaries.set(failedJobId, buildSummary({ id: failedJobId, status: 'failed', lastError: 'Video is 2s; minimum is 3s', lastErrorKind: 'permanent' }));
  fake.summaries.set(publishedJobId, buildSummary({ id: publishedJobId, status: 'published' }));
  return { dependencies: fake.dependencies, enqueued: fake.enqueuedPrepares };
}

describe('publish job routes', () => {
  it('lists jobs in the contract shape, with retry availability', async () => {
    const server = await buildApiServer(buildFakeDependencies().dependencies);
    const response = await server.inject({ method: 'GET', url: apiRoutes.publishJobs, headers: signedIn });
    expect(response.statusCode).toBe(200);
    const { jobs } = listPublishJobsResponseSchema.parse(response.json());
    expect(jobs.map((job) => [job.id, job.canRetry])).toEqual([[failedJobId, true], [publishedJobId, false]]);
  });

  it('filters by status and rejects invalid query parameters', async () => {
    const server = await buildApiServer(buildFakeDependencies().dependencies);
    const filtered = await server.inject({ method: 'GET', url: `${apiRoutes.publishJobs}?status=failed`, headers: signedIn });
    expect(filtered.json().jobs).toHaveLength(1);
    expect((await server.inject({ method: 'GET', url: `${apiRoutes.publishJobs}?status=exploded`, headers: signedIn })).statusCode).toBe(400);
    expect((await server.inject({ method: 'GET', url: `${apiRoutes.publishJobs}?limit=5000`, headers: signedIn })).statusCode).toBe(400);
  });

  it('retries a failed job: clears the error, requeues it under a fresh queue job ID', async () => {
    const { dependencies, enqueued } = buildFakeDependencies();
    const server = await buildApiServer(dependencies);
    const response = await server.inject({ method: 'POST', url: apiRoutes.retryPublishJob(failedJobId), headers: signedIn });
    expect(response.statusCode).toBe(200);
    const { job } = retryPublishJobResponseSchema.parse(response.json());
    expect(job).toMatchObject({ status: 'queued', lastError: null, canRetry: false });
    expect(enqueued).toEqual([{ publishJobId: failedJobId, jobId: `prepare-${failedJobId}-retry-${now.getTime()}` }]);
  });

  it('refuses to retry a published job, and 404s unknown or malformed IDs', async () => {
    const server = await buildApiServer(buildFakeDependencies().dependencies);
    expect((await server.inject({ method: 'POST', url: apiRoutes.retryPublishJob(publishedJobId), headers: signedIn })).statusCode).toBe(409);
    expect((await server.inject({ method: 'POST', url: apiRoutes.retryPublishJob('33333333-3333-4333-8333-333333333333'), headers: signedIn })).statusCode).toBe(404);
    expect((await server.inject({ method: 'GET', url: apiRoutes.publishJob('not-a-uuid'), headers: signedIn })).statusCode).toBe(400);
  });

  it('reports health without a login', async () => {
    const server = await buildApiServer(buildFakeDependencies().dependencies);
    expect((await server.inject({ method: 'GET', url: apiRoutes.health })).json()).toEqual({ status: 'ok', dryRun: false });
  });
});
