import { queueNames, retryAfterAwareBackoff, runWithErrorPolicy, type QueueName } from '@fanout/queue';
import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { WorkerDependencies } from './dependencies.ts';
import { createIngestProcessor } from './processors/ingestProcessor.ts';
import { createPrepareProcessor } from './processors/prepareProcessor.ts';
import { createPublishProcessor } from './processors/publishProcessor.ts';
import { createPurgeExpiredAssetsProcessor } from './processors/purgeExpiredAssetsProcessor.ts';
import { createWatchProcessor } from './processors/watchProcessor.ts';

type Processor = (job: Job, token?: string) => Promise<unknown>;

export interface WorkerConcurrency {
  media: number;
  publish: number;
}

/** Jobs without a publish-job row (watch, ingest, purge) just log their final failure. */
function withLoggedFailures(dependencies: WorkerDependencies, queueName: QueueName, processor: Processor): Processor {
  return (job, token) =>
    runWithErrorPolicy(job, { onFinalFailure: async ({ kind, message }) => dependencies.logger.error({ queueName, jobId: job.id, errorKind: kind, error: message }, 'Job failed') }, () => processor(job, token));
}

function processorsFor(dependencies: WorkerDependencies): Record<QueueName, Processor> {
  return {
    [queueNames.watch]: withLoggedFailures(dependencies, queueNames.watch, createWatchProcessor(dependencies)),
    [queueNames.ingest]: withLoggedFailures(dependencies, queueNames.ingest, createIngestProcessor(dependencies)),
    [queueNames.prepare]: createPrepareProcessor(dependencies),
    [queueNames.publish]: createPublishProcessor(dependencies),
    [queueNames.maintenance]: withLoggedFailures(dependencies, queueNames.maintenance, createPurgeExpiredAssetsProcessor(dependencies)),
  };
}

function concurrencyFor(queueName: QueueName, concurrency: WorkerConcurrency): number {
  if (queueName === queueNames.ingest || queueName === queueNames.prepare) return concurrency.media;
  return queueName === queueNames.publish ? concurrency.publish : 1;
}

export interface PipelineWorkers {
  workers: Worker[];
  close(): Promise<void>;
}

export function startPipelineWorkers(dependencies: WorkerDependencies, redis: Redis, concurrency: WorkerConcurrency): PipelineWorkers {
  const workers = Object.entries(processorsFor(dependencies)).map(([queueName, processor]) => {
    const worker = new Worker(queueName, processor, {
      connection: redis.duplicate(),
      concurrency: concurrencyFor(queueName as QueueName, concurrency),
      settings: { backoffStrategy: retryAfterAwareBackoff },
    });
    worker.on('error', (error) => dependencies.logger.error({ queueName, err: error }, 'Worker error'));
    return worker;
  });
  return { workers, close: async () => void (await Promise.all(workers.map((worker) => worker.close()))) };
}
