import { planPublishJobs, type SourceItem } from '@fanout/domain';
import type { WorkerDependencies } from '../dependencies.ts';

/** Creates (idempotently) one publish job per destination of every enabled workflow, and queues the ready ones. */
export async function fanOutSourceItem(dependencies: WorkerDependencies, sourceItem: SourceItem): Promise<number> {
  const { repositories, queues, settings } = dependencies;
  const workflows = await repositories.workflowRepository.listEnabledForSource(sourceItem.sourceConnectionId);
  let queuedCount = 0;
  for (const workflow of workflows) {
    const planned = await planPublishJobs({ workflow, sourceItem, now: dependencies.now(), dryRun: settings.dryRun });
    const publishJobs = await repositories.publishJobRepository.insertPlanned(planned);
    for (const publishJob of publishJobs.filter((job) => job.status === 'queued' && job.scheduledFor !== null)) {
      await queues.enqueuePrepare(publishJob.id);
      queuedCount += 1;
    }
  }
  return queuedCount;
}
