import { expect, test } from '@playwright/test';
import { buildJob, initialState, installFakeApi } from './fakeApi.ts';

test('the activity log shows every attempt and can retry a failed one', async ({ page }) => {
  const failed = buildJob({ destinationKind: 'tiktok', status: 'failed', canRetry: true, lastError: 'Video is 2s; minimum is 3s', lastErrorKind: 'permanent', publishedAt: null });
  const state = await installFakeApi(page, initialState({ jobs: [buildJob({}), failed] }));
  await page.goto('/activity');
  await expect(page.getByTestId('publish-job-row')).toHaveCount(2);
  await page.getByRole('row', { name: /TikTok/ }).click();
  await expect(page.getByTestId('job-error')).toContainText('minimum is 3s');
  await page.getByRole('button', { name: 'Retry TikTok' }).click();
  await expect(page.getByRole('row', { name: /TikTok/ }).getByTestId('job-status')).toHaveText('queued');
  expect(state.requests).toContain(`POST /api/publish-jobs/${failed.id}/retry`);
});
