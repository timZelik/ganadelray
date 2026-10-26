import type { PublishJobView } from '@fanout/api-contract';
import type { Page } from '@playwright/test';

export function buildJob(overrides: Partial<PublishJobView>): PublishJobView {
  return {
    id: crypto.randomUUID(), status: 'published', dryRun: true, attemptCount: 1, destinationKind: 'instagram_reels', publisherRoute: 'console',
    workflowName: 'Hub → everywhere', sourceItemTitle: 'morning routine', sourceItemExternalId: 'morning-routine.mp4@1-1', scheduledFor: null,
    publishedAt: new Date().toISOString(), externalPostId: null, externalPostUrl: null, lastError: null, lastErrorKind: null,
    requestPreview: { destination: 'instagram_reels', caption: 'Morning routine #reels' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), canRetry: false,
    ...overrides,
  };
}

/** A stateful stand-in for the API, so the dashboard can be driven end to end without the backend. */
export async function installFakeApi(page: Page, initialJobs: PublishJobView[]) {
  const jobs = new Map(initialJobs.map((job) => [job.id, job]));
  const retriedJobIds: string[] = [];
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'ok', dryRun: true } }));
  await page.route('**/api/publish-jobs?*', (route) => {
    const status = new URL(route.request().url()).searchParams.get('status');
    return route.fulfill({ json: { jobs: [...jobs.values()].filter((job) => !status || job.status === status) } });
  });
  await page.route('**/api/publish-jobs/*/retry', (route) => {
    const jobId = route.request().url().split('/').at(-2)!;
    const retried: PublishJobView = { ...jobs.get(jobId)!, status: 'queued', lastError: null, lastErrorKind: null, canRetry: false };
    jobs.set(jobId, retried);
    retriedJobIds.push(jobId);
    return route.fulfill({ json: { job: retried } });
  });
  return { retriedJobIds };
}
