import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { jobIdentifiers } from './jobIdentifiers.ts';
import { queueNames, type JobPayload, type QueueName } from './jobPayloads.ts';

const day = 24 * 60 * 60 * 1000;

export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  // A non-builtin type routes every retry through the worker's retryAfterAwareBackoff strategy.
  backoff: { type: 'retry-after-aware' },
  removeOnComplete: { age: 7 * day / 1000, count: 5_000 },
  removeOnFail: { age: 30 * day / 1000 },
};

export type PipelineQueues = { [Name in QueueName]: Queue<JobPayload<Name>> } & {
  enqueueIngest(payload: JobPayload<'ingest'>): Promise<void>;
  findIngestOutcome(connectionId: string, externalId: string): Promise<IngestOutcome>;
  enqueuePrepare(publishJobId: string, options?: { delayMilliseconds?: number; jobId?: string }): Promise<void>;
  enqueuePublish(publishJobId: string, options?: { delayMilliseconds?: number }): Promise<void>;
  scheduleWatcher(connectionId: string, intervalMilliseconds: number): Promise<void>;
  scheduleAssetPurge(intervalMilliseconds: number): Promise<void>;
  close(): Promise<void>;
};

/** Where a detected or uploaded item is in ingest; `failed` carries the reason a person should see. */
export type IngestOutcome =
  | { state: 'processing' }
  | { state: 'done'; sourceItemId: string | null }
  | { state: 'failed'; reason: string }
  | { state: 'unknown' };

function createQueue<Name extends QueueName>(name: Name, connection: Redis): Queue<JobPayload<Name>> {
  return new Queue<JobPayload<Name>>(name, { connection, defaultJobOptions });
}

/** One typed façade over every queue in the pipeline, shared by the API (retries) and the worker (fan-out). */
export function createPipelineQueues(connection: Redis): PipelineQueues {
  const queues = {
    watch: createQueue(queueNames.watch, connection),
    ingest: createQueue(queueNames.ingest, connection),
    prepare: createQueue(queueNames.prepare, connection),
    publish: createQueue(queueNames.publish, connection),
    maintenance: createQueue(queueNames.maintenance, connection),
  };
  return {
    ...queues,
    async enqueueIngest(payload) {
      await queues.ingest.add('ingest', payload, { jobId: jobIdentifiers.ingest(payload.connectionId, payload.candidate.externalId) });
    },
    async findIngestOutcome(connectionId, externalId) {
      const job = await queues.ingest.getJob(jobIdentifiers.ingest(connectionId, externalId));
      if (!job) return { state: 'unknown' };
      const jobState = await job.getState();
      if (jobState === 'completed') return { state: 'done', sourceItemId: typeof job.returnvalue === 'string' ? job.returnvalue : null };
      if (jobState === 'failed') return { state: 'failed', reason: job.failedReason ?? 'Unknown error' };
      return { state: 'processing' };
    },
    async enqueuePrepare(publishJobId, { delayMilliseconds = 0, jobId = jobIdentifiers.prepare(publishJobId) } = {}) {
      await queues.prepare.add('prepare', { publishJobId }, { jobId, delay: Math.max(0, delayMilliseconds) });
    },
    async enqueuePublish(publishJobId, { delayMilliseconds = 0 } = {}) {
      await queues.publish.add('publish', { publishJobId }, { jobId: `${jobIdentifiers.publish(publishJobId)}-${Date.now()}`, delay: Math.max(0, delayMilliseconds) });
    },
    async scheduleWatcher(connectionId, intervalMilliseconds) {
      await queues.watch.upsertJobScheduler(jobIdentifiers.watchScheduler(connectionId), { every: intervalMilliseconds }, { name: 'watch', data: { connectionId }, opts: { attempts: 1 } });
    },
    async scheduleAssetPurge(intervalMilliseconds) {
      await queues.maintenance.upsertJobScheduler(jobIdentifiers.purgeScheduler(), { every: intervalMilliseconds }, { name: 'purge', data: { task: 'purge_expired_assets' }, opts: { attempts: 1 } });
    },
    async close() {
      await Promise.all(Object.values(queues).map((queue) => queue.close()));
    },
  };
}
