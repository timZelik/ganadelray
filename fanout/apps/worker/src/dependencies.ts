import type { CaptionRewriter } from '@fanout/captions';
import type { ConnectorRegistry } from '@fanout/connectors-core';
import type { Repositories } from '@fanout/database';
import type { Logger } from '@fanout/logging';
import type { MediaToolPaths } from '@fanout/media';
import type { PipelineQueues, RateLimiter } from '@fanout/queue';
import type { ObjectStorage } from '@fanout/storage';

export interface PipelineSettings {
  dryRun: boolean;
  xCostSavingMode: boolean;
  renderedAssetRetentionMilliseconds: number;
  presignedUrlTtlSeconds: number;
  minimumSourceDurationSeconds: number;
  mediaWorkDirectory: string;
  mediaTools: MediaToolPaths;
}

/** Everything a processor may touch, injected so processors stay testable without real infrastructure. */
export interface WorkerDependencies {
  repositories: Repositories;
  storage: ObjectStorage;
  queues: PipelineQueues;
  registry: ConnectorRegistry;
  rateLimiter: RateLimiter;
  captionRewriter: CaptionRewriter;
  logger: Logger;
  settings: PipelineSettings;
  now: () => Date;
}
