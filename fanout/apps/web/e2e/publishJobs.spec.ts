import { expect, test } from '@playwright/test';
import { buildJob, installFakeApi } from './fakeApi.ts';

test('shows dry-run jobs for every destination with their status', async ({ page }) => {
  await installFakeApi(page, [
    buildJob({ destinationKind: 'instagram_reels' }),
    buildJob({ destinationKind: 'tiktok', status: 'publishing', publishedAt: null }),
  ]);
  await page.goto('/');
  await expect(page.getByTestId('dry-run-badge')).toBeVisible();
  await expect(page.getByTestId('publish-job-row')).toHaveCount(2);
  await expect(page.getByRole('row', { name: /Instagram Reels/ }).getByTestId('job-status')).toHaveText('dry run ✓');
  await expect(page.getByRole('row', { name: /TikTok/ }).getByTestId('job-status')).toHaveText('publishing');
});

test('expanding a job shows the request that would have been sent', async ({ page }) => {
  await installFakeApi(page, [buildJob({})]);
  await page.goto('/');
  await page.getByTestId('publish-job-row').click();
  await expect(page.getByTestId('request-preview')).toContainText('Morning routine #reels');
});

test('retrying a failed job requeues it', async ({ page }) => {
  const failed = buildJob({ destinationKind: 'tiktok', status: 'failed', canRetry: true, lastError: 'Video is 2s; minimum is 3s', lastErrorKind: 'permanent', publishedAt: null });
  const fakeApi = await installFakeApi(page, [failed]);
  await page.goto('/');
  await page.getByTestId('publish-job-row').click();
  await expect(page.getByTestId('job-error')).toContainText('minimum is 3s');
  await page.getByRole('button', { name: 'Retry TikTok' }).click();
  await expect(page.getByTestId('job-status')).toHaveText('queued');
  await expect(page.getByRole('button', { name: 'Retry TikTok' })).toHaveCount(0);
  expect(fakeApi.retriedJobIds).toEqual([failed.id]);
});

test('filters by status', async ({ page }) => {
  await installFakeApi(page, [buildJob({}), buildJob({ status: 'failed', canRetry: true })]);
  await page.goto('/');
  await page.getByRole('tab', { name: 'failed' }).click();
  await expect(page.getByTestId('publish-job-row')).toHaveCount(1);
});

test('explains what to do when there are no jobs', async ({ page }) => {
  await installFakeApi(page, []);
  await page.goto('/');
  await expect(page.getByTestId('empty-state')).toContainText('Drop a video into the hub folder');
});
