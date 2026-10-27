import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnvironment } from '@fanout/config';
import { randomUUID } from 'node:crypto';
import { createDatabase, createRepositories, createTokenCipher, runMigrations, seedDefaults, uploadAccountHandle, type PublishJobSummary } from '@fanout/database';
import { storageKeys } from '@fanout/storage';
import { createTemporaryDirectory, createSilentLogger, createTestVideo, startPostgresContainer, startRedisContainer, startS3Container, buildTestEnvironment, type StartedPostgreSqlContainer, type StartedS3, type StartedTestContainer } from '@fanout/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWorker, type RunningWorker } from '../src/bootstrap.ts';

let postgres: StartedPostgreSqlContainer;
let redis: StartedTestContainer;
let s3: StartedS3;
let worker: RunningWorker;
let hubDirectory: string;

/** Exports land in the hub atomically (rename), the way a finished export appears. */
async function dropIntoHub(fileName: string, durationSeconds: number, caption?: string): Promise<void> {
  const exportDirectory = await createTemporaryDirectory('fanout-export-');
  const exportedPath = await createTestVideo(exportDirectory, { width: 1280, height: 720, durationSeconds, fileName });
  if (caption) await writeFile(join(hubDirectory, fileName.replace(/\.\w+$/, '.txt')), caption);
  await rename(exportedPath, join(hubDirectory, fileName));
}

async function jobsForTitle(title: string): Promise<PublishJobSummary[]> {
  const summaries = await worker.dependencies.repositories.publishJobRepository.listSummaries({ limit: 100 });
  return summaries.filter((summary) => summary.sourceItemTitle === title);
}

async function waitForSettledJobs(title: string, expectedCount: number): Promise<PublishJobSummary[]> {
  await expect.poll(async () => (await jobsForTitle(title)).filter((job) => ['published', 'failed'].includes(job.status)).length, { timeout: 120_000, interval: 500 }).toBe(expectedCount);
  return jobsForTitle(title);
}

beforeAll(async () => {
  const [startedPostgres, startedRedis, startedS3] = await Promise.all([startPostgresContainer(), startRedisContainer(), startS3Container()]);
  postgres = startedPostgres;
  redis = startedRedis.container;
  s3 = startedS3;
  hubDirectory = await createTemporaryDirectory('fanout-hub-');
  const environment = loadEnvironment(buildTestEnvironment({ databaseUrl: postgres.getConnectionUri(), redisUrl: startedRedis.url, s3 }, { HUB_DIRECTORY: hubDirectory, MEDIA_WORK_DIRECTORY: await createTemporaryDirectory('fanout-media-') }));
  const migrationHandle = createDatabase(environment.DATABASE_URL, 1);
  await runMigrations(migrationHandle.database);
  await seedDefaults(createRepositories(migrationHandle.database, createTokenCipher(environment.TOKEN_ENCRYPTION_KEY)), { hubDirectory });
  await migrationHandle.close();
  worker = await startWorker(environment, createSilentLogger());
});

afterAll(async () => {
  await worker?.stop();
  await Promise.all([postgres?.stop(), redis?.stop(), s3?.container.stop()]);
});

describe('hub folder → watcher → media → publish (dry run)', () => {
  it('turns one dropped video into four normalized assets (one shared encode) and four dry-run publish jobs', async () => {
    await dropIntoHub('morning-routine.mp4', 4, 'Morning routine that changed everything https://example.com #habits');
    const jobs = await waitForSettledJobs('morning routine', 4);
    expect(jobs.map((job) => [job.destinationKind, job.status, job.dryRun])).toEqual(expect.arrayContaining([
      ['instagram_reels', 'published', true], ['tiktok', 'published', true], ['youtube_shorts', 'published', true], ['linkedin', 'published', true],
    ]));
    const reels = jobs.find((job) => job.destinationKind === 'instagram_reels')!;
    expect(reels.requestPreview).toMatchObject({ destination: 'instagram_reels', caption: expect.stringContaining('#reels #creator'), media: { resolution: '1080x1920' } });
    expect(reels.attemptCount).toBe(1);

    const { assetRepository } = worker.dependencies.repositories;
    const assets = await Promise.all(jobs.map((job) => assetRepository.findLiveForDestination(job.sourceItemId, job.workflowDestinationId, new Date())));
    expect(new Set(assets.map((asset) => asset!.storageKey)).size).toBe(1);
    for (const asset of assets) {
      expect(asset!.metadata).toMatchObject({ width: 1080, height: 1920, videoCodec: 'h264', videoProfile: 'High', audioCodec: 'aac', audioSampleRateHz: 48_000, hasFastStart: true });
      expect(await worker.dependencies.storage.objectExists(asset!.storageKey)).toBe(true);
    }
  });

  it('fails destinations whose limits the video breaks, with a clear permanent error, and still publishes the rest', async () => {
    await dropIntoHub('quick-tip.mp4', 2);
    const jobs = await waitForSettledJobs('quick tip', 4);
    const byDestination = Object.fromEntries(jobs.map((job) => [job.destinationKind, job]));
    expect(byDestination.youtube_shorts!.status).toBe('published');
    for (const destination of ['instagram_reels', 'tiktok', 'linkedin']) {
      expect(byDestination[destination]).toMatchObject({ status: 'failed', lastErrorKind: 'permanent', lastError: expect.stringContaining('minimum is 3s') });
    }
  });

  it('ignores files that are not valid media without creating jobs', async () => {
    await writeFile(join(hubDirectory, 'broken.mp4'), 'definitely not a video');
    await dropIntoHub('after-broken.mp4', 4);
    await waitForSettledJobs('after broken', 4);
    expect(await jobsForTitle('broken')).toEqual([]);
  });

  it('processes a browser upload: practice posts on every platform, a thumbnail, and the temporary upload removed', async () => {
    const { connectionRepository, sourceItemRepository } = worker.dependencies.repositories;
    const uploadConnection = (await connectionRepository.findByPlatformAndHandle('upload', uploadAccountHandle))!;
    const exportDirectory = await createTemporaryDirectory('fanout-upload-');
    const videoPath = await createTestVideo(exportDirectory, { width: 1920, height: 1080, durationSeconds: 4, fileName: 'studio-tour.mov' });
    const uploadId = randomUUID();
    const storageKey = storageKeys.upload(uploadId, '.mov');
    await worker.dependencies.storage.uploadFile(storageKey, videoPath, 'video/quicktime');
    await worker.dependencies.queues.enqueueIngest({ connectionId: uploadConnection.id, candidate: { externalId: uploadId, title: 'studio tour', originalCaption: 'Inside the studio', detectedAt: new Date().toISOString(), locator: { storageKey, fileName: 'studio-tour.mov' } } });
    const jobs = await waitForSettledJobs('studio tour', 4);
    expect(jobs.every((job) => job.status === 'published' && job.dryRun && job.publisherRoute === 'console')).toBe(true);
    const sourceItem = (await sourceItemRepository.findByExternalId(uploadConnection.id, uploadId))!;
    expect(await worker.dependencies.storage.objectExists(sourceItem.thumbnailStorageKey!)).toBe(true);
    expect(await worker.dependencies.storage.objectExists(storageKey)).toBe(false);
    expect(await worker.dependencies.queues.findIngestOutcome(uploadConnection.id, uploadId)).toEqual({ state: 'done', sourceItemId: sourceItem.id });
  });

  it('never creates duplicate jobs when the same item is seen again', async () => {
    const { connectionRepository, workflowRepository } = worker.dependencies.repositories;
    const hub = await connectionRepository.findByPlatformAndHandle('local_folder', 'hub');
    await worker.dependencies.repositories.watchCursorRepository.save(hub!.id, null);
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    expect(await jobsForTitle('morning routine')).toHaveLength(4);
    expect((await workflowRepository.listAll()).filter((workflow) => workflow.sourceConnectionId === hub!.id)).toHaveLength(1);
  });
});
