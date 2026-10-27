import { expect, test } from '@playwright/test';
import { buildPost, buildVideo, initialState, installFakeApi } from './fakeApi.ts';

const sampleVideo = { name: 'studio-tour.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not really a video, the fake API does not care') };

test('logging in: wrong password explains itself, the right one lands on Videos', async ({ page }) => {
  await installFakeApi(page, initialState({ signedIn: false }));
  await page.goto('/platforms');
  await expect(page).toHaveURL(/\/login\?next=%2Fplatforms/);
  await page.getByLabel('Email').fill('gana@example.com');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('That email and password do not match.');
  await page.getByLabel('Password').fill('correct-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Platforms' })).toBeVisible();
});

test('first visit: a checklist and practice-mode notice explain what to do', async ({ page }) => {
  await installFakeApi(page);
  await page.goto('/');
  await expect(page.getByTestId('getting-started')).toContainText('Connect Buffer');
  await expect(page.getByTestId('practice-banner')).toBeVisible();
  await expect(page.getByTestId('no-videos')).toBeVisible();
  await expect(page.getByTestId('post-button')).toHaveCount(0);
});

test('uploading a video with a caption shows it on every platform', async ({ page }) => {
  const state = await installFakeApi(page);
  await page.goto('/');
  await page.getByTestId('upload-input').setInputFiles({ ...sampleVideo, name: 'my-first-upload.mp4' });
  await page.getByTestId('caption-input').fill('Come inside the studio with me');
  await expect(page.getByTestId('post-button')).toHaveText('Try it');
  await page.getByTestId('post-button').click();
  const card = page.getByTestId('video-card').filter({ hasText: 'my first upload' });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card.getByTestId('post-status')).toHaveCount(4);
  await expect(card.locator('[data-platform="tiktok"]')).toContainText('Practice: not posted');
  expect(state.requests).toContain('POST /api/videos');
});

test('a file Fanout cannot read explains what to do instead', async ({ page }) => {
  await installFakeApi(page, initialState({ uploadOutcome: { state: 'failed', problem: "We couldn't read this file. Try exporting it again as an MP4." } }));
  await page.goto('/');
  await page.getByTestId('upload-input').setInputFiles(sampleVideo);
  await page.getByTestId('post-button').click();
  await expect(page.getByTestId('pending-upload').getByRole('alert')).toHaveText("We couldn't read this file. Try exporting it again as an MP4.", { timeout: 10_000 });
});

test('a failed post says why and can be tried again in one click', async ({ page }) => {
  const failedPost = buildPost({ destinationKind: 'linkedin', state: 'failed', problem: 'Too short for this platform: it needs at least 3 seconds.', canRetry: true });
  await installFakeApi(page, initialState({ videos: [buildVideo({ posts: [buildPost({ destinationKind: 'tiktok', postUrl: 'https://www.tiktok.com/@gana/video/1' }), failedPost] })] }));
  await page.goto('/');
  await expect(page.locator('[data-platform="tiktok"]').getByRole('link', { name: 'View' })).toHaveAttribute('href', 'https://www.tiktok.com/@gana/video/1');
  await expect(page.getByTestId('post-problem')).toHaveText('Too short for this platform: it needs at least 3 seconds.');
  await page.getByRole('button', { name: 'Try linkedin again' }).click();
  await expect(page.locator('[data-platform="linkedin"]')).toHaveAttribute('data-state', 'waiting');
});

test('connecting Buffer: a bad key explains itself, a good one switches TikTok to live', async ({ page }) => {
  await installFakeApi(page);
  await page.goto('/platforms');
  await page.getByTestId('buffer-key-input').fill('this-is-not-valid');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('alert')).toContainText('Buffer did not accept that API key');
  await page.getByTestId('buffer-key-input').fill('valid-buffer-key');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByTestId('buffer-connected')).toContainText('Gana Studio');
  const tiktok = page.locator('[data-testid="destination-card"][data-platform="tiktok"]');
  await expect(tiktok).toContainText('Posts for real');
  await expect(tiktok.getByTestId('account-select')).toHaveValue('channel-tiktok');
});

test('editing a caption style previews the result live and saves', async ({ page }) => {
  await installFakeApi(page);
  await page.goto('/platforms');
  const reels = page.locator('[data-testid="destination-card"][data-platform="instagram_reels"]');
  await reels.getByTestId('hashtags-input').fill('#art #studio');
  await expect(reels.getByTestId('caption-preview')).toContainText('#art #studio');
  await reels.getByRole('button', { name: 'Save' }).click();
  await expect(reels.getByText('Saved')).toBeVisible();
});

test('turning a platform off and choosing the framing', async ({ page }) => {
  await installFakeApi(page);
  await page.goto('/platforms');
  await page.getByRole('switch', { name: 'Post to LinkedIn' }).click();
  await expect(page.getByRole('switch', { name: 'Post to LinkedIn' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('radio', { name: /Show the whole video/ }).click();
  await expect(page.getByRole('radio', { name: /Show the whole video/ })).toHaveAttribute('aria-checked', 'true');
});
