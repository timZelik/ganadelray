import type { SourceKind } from '@fanout/domain';
import { watchJobSchema } from '@fanout/queue';
import type { Job } from 'bullmq';
import type { WorkerDependencies } from '../dependencies.ts';

/** Polls one source connection and enqueues an ingest job per new item; the cursor only advances after enqueueing. */
export function createWatchProcessor(dependencies: WorkerDependencies) {
  const { repositories, registry, queues, logger } = dependencies;
  return async function processWatchJob(job: Job): Promise<number> {
    const { connectionId } = watchJobSchema.parse(job.data);
    const connection = await repositories.connectionRepository.findById(connectionId);
    if (connection?.status !== 'active') return 0;
    const watcher = registry.getSourceWatcher(connection.platform as SourceKind);
    const { items, nextCursor } = await watcher.listNewItemsSince(connection, await repositories.watchCursorRepository.find(connectionId));
    for (const item of items) {
      await queues.enqueueIngest({ connectionId, candidate: { ...item, detectedAt: item.detectedAt.toISOString() } });
    }
    await repositories.watchCursorRepository.save(connectionId, nextCursor);
    if (items.length > 0) logger.info({ connectionId, newItems: items.length }, 'Detected new source items');
    return items.length;
  };
}
