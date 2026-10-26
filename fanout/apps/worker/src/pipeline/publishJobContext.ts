import type { Publisher } from '@fanout/connectors-core';
import { PermanentError, type PublishJob, type SourceItem, type Workflow, type WorkflowDestination } from '@fanout/domain';
import type { WorkerDependencies } from '../dependencies.ts';

export interface PublishJobContext {
  publishJob: PublishJob;
  workflow: Workflow;
  destination: WorkflowDestination;
  sourceItem: SourceItem;
  publisher: Publisher;
}

function required<Value>(value: Value | null | undefined, description: string): Value {
  if (value === null || value === undefined) throw new PermanentError(`${description} no longer exists`);
  return value;
}

/** Loads the publish job together with everything it refers to; shared by the prepare and publish steps. */
export async function loadPublishJobContext({ repositories, registry }: WorkerDependencies, publishJob: PublishJob): Promise<PublishJobContext> {
  const [workflow, sourceItem] = await Promise.all([
    repositories.workflowRepository.findById(publishJob.workflowId),
    repositories.sourceItemRepository.findById(publishJob.sourceItemId),
  ]);
  const requiredWorkflow = required(workflow, `Workflow ${publishJob.workflowId}`);
  const destination = required(requiredWorkflow.destinations.find((candidate) => candidate.id === publishJob.workflowDestinationId), `Destination ${publishJob.workflowDestinationId}`);
  return {
    publishJob,
    workflow: requiredWorkflow,
    destination,
    sourceItem: required(sourceItem, `Source item ${publishJob.sourceItemId}`),
    publisher: registry.getPublisher(destination.publisherRoute, destination.destinationKind),
  };
}
