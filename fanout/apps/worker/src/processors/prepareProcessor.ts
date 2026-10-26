import { publishJobReferenceSchema, runWithErrorPolicy } from '@fanout/queue';
import type { Job } from 'bullmq';
import type { WorkerDependencies } from '../dependencies.ts';
import { loadPublishJobContext } from '../pipeline/publishJobContext.ts';
import { publishJobFailureHooks } from '../pipeline/publishJobFailures.ts';
import { ensureRenditionAsset } from '../pipeline/renditions.ts';

/** Renders the destination's asset ahead of time, then queues the publish step for the scheduled moment. */
export function createPrepareProcessor(dependencies: WorkerDependencies) {
  const { repositories, queues, logger } = dependencies;
  return async function processPrepareJob(job: Job): Promise<void> {
    const { publishJobId } = publishJobReferenceSchema.parse(job.data);
    let connectionId: string | null = null;
    await runWithErrorPolicy(job, publishJobFailureHooks(dependencies, publishJobId, () => connectionId), async () => {
      const publishJob = await repositories.publishJobRepository.transition(publishJobId, 'preparing');
      if (!publishJob) return logger.debug({ correlationId: publishJobId }, 'Prepare skipped: job is not waiting to be prepared');
      const context = await loadPublishJobContext(dependencies, publishJob);
      connectionId = context.destination.connectionId;
      const asset = await ensureRenditionAsset(dependencies, context);
      const delayMilliseconds = (publishJob.scheduledFor?.getTime() ?? dependencies.now().getTime()) - dependencies.now().getTime();
      await queues.enqueuePublish(publishJobId, { delayMilliseconds });
      logger.info({ correlationId: publishJobId, assetId: asset.id, destinationKind: context.destination.destinationKind, delayMilliseconds }, 'Asset prepared');
    });
  };
}
