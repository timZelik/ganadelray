import { noopCaptionRewriter } from '@fanout/captions';
import type { Environment } from '@fanout/config';
import { createConnectorRegistry } from '@fanout/connectors-core';
import { createDatabase, createRepositories, createTokenCipher, ensureDefaultHubWorkflow } from '@fanout/database';
import type { Logger } from '@fanout/logging';
import { createPipelineQueues, createRateLimiter, createRedisConnection } from '@fanout/queue';
import { createS3ObjectStorage } from '@fanout/storage';
import { installedConnectorModules } from './connectorModules.ts';
import type { WorkerDependencies } from './dependencies.ts';
import { startPipelineWorkers } from './workers.ts';

const day = 24 * 60 * 60 * 1000;
const scheduleRefreshMilliseconds = 60_000;
const assetPurgeIntervalMilliseconds = 60 * 60 * 1000;

export interface RunningWorker {
  dependencies: WorkerDependencies;
  stop(): Promise<void>;
}

/** Keeps one watch scheduler per source that feeds an enabled workflow (picks up workflows created later). */
async function scheduleWatchers(dependencies: WorkerDependencies, intervalMilliseconds: number): Promise<void> {
  const sourceConnectionIds = await dependencies.repositories.workflowRepository.listSourceConnectionIdsWithEnabledWorkflows();
  await Promise.all(sourceConnectionIds.map((connectionId) => dependencies.queues.scheduleWatcher(connectionId, intervalMilliseconds)));
}

export async function startWorker(environment: Environment, logger: Logger): Promise<RunningWorker> {
  const databaseHandle = createDatabase(environment.DATABASE_URL);
  const redis = createRedisConnection(environment.REDIS_URL);
  const storage = createS3ObjectStorage({
    bucket: environment.S3_BUCKET, region: environment.S3_REGION, accessKeyId: environment.S3_ACCESS_KEY_ID, secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
    endpoint: environment.S3_ENDPOINT, publicEndpoint: environment.S3_PUBLIC_ENDPOINT, forcePathStyle: environment.S3_FORCE_PATH_STYLE,
  });
  await storage.ensureBucket();
  const repositories = createRepositories(databaseHandle.database, createTokenCipher(environment.TOKEN_ENCRYPTION_KEY));
  await ensureDefaultHubWorkflow(repositories, environment.HUB_DIRECTORY);
  const dependencies: WorkerDependencies = {
    repositories, storage, logger,
    queues: createPipelineQueues(redis),
    registry: createConnectorRegistry(installedConnectorModules({ hubSettleMilliseconds: environment.HUB_SETTLE_SECONDS * 1000 })),
    rateLimiter: createRateLimiter(redis),
    captionRewriter: noopCaptionRewriter,
    now: () => new Date(),
    settings: {
      dryRun: environment.PUBLISH_DRY_RUN,
      xCostSavingMode: environment.X_COST_SAVING_MODE,
      renderedAssetRetentionMilliseconds: environment.RENDERED_ASSET_RETENTION_DAYS * day,
      presignedUrlTtlSeconds: environment.PRESIGNED_URL_TTL_SECONDS,
      minimumSourceDurationSeconds: environment.MINIMUM_SOURCE_DURATION_SECONDS,
      mediaWorkDirectory: environment.MEDIA_WORK_DIRECTORY,
      mediaTools: { ffmpegPath: environment.FFMPEG_PATH, ffprobePath: environment.FFPROBE_PATH },
    },
  };
  const workers = startPipelineWorkers(dependencies, redis, { media: environment.MEDIA_CONCURRENCY, publish: 5 });
  const watchIntervalMilliseconds = environment.WATCH_INTERVAL_SECONDS * 1000;
  await scheduleWatchers(dependencies, watchIntervalMilliseconds);
  await dependencies.queues.scheduleAssetPurge(assetPurgeIntervalMilliseconds);
  const refreshTimer = setInterval(() => void scheduleWatchers(dependencies, watchIntervalMilliseconds).catch((error: unknown) => logger.error({ err: error }, 'Watch scheduling failed')), scheduleRefreshMilliseconds);
  logger.info({ dryRun: environment.PUBLISH_DRY_RUN, hubDirectory: environment.HUB_DIRECTORY }, 'Worker started');
  return {
    dependencies,
    async stop() {
      clearInterval(refreshTimer);
      await workers.close();
      await dependencies.queues.close();
      redis.disconnect();
      await databaseHandle.close();
    },
  };
}
