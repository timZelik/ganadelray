import type { SourceItem, Workflow, WorkflowDestination } from './entities.ts';
import { createPublishJobIdempotencyKey } from './idempotency.ts';

export interface PlannedPublishJob {
  workflowId: string;
  sourceItemId: string;
  workflowDestinationId: string;
  idempotencyKey: string;
  /** `null` means "waiting for a backlog slot"; the slot scheduler assigns it. */
  scheduledFor: Date | null;
  dryRun: boolean;
}

export interface FanOutRequest {
  workflow: Workflow;
  sourceItem: SourceItem;
  now: Date;
  dryRun: boolean;
}

function isPublishable(workflow: Workflow, destination: WorkflowDestination): boolean {
  return workflow.enabled && destination.enabled;
}

/** The console stand-in never posts anything, so its jobs are always dry runs, whatever the global setting. */
function isDryRun(destination: WorkflowDestination, dryRun: boolean): boolean {
  return dryRun || destination.publisherRoute === 'console';
}

function scheduledTimeFor(workflow: Workflow, now: Date): Date | null {
  return workflow.mode === 'auto_new' ? now : null;
}

/** Turns one new source item into one planned publish job per enabled destination of the workflow. */
export async function planPublishJobs({ workflow, sourceItem, now, dryRun }: FanOutRequest): Promise<PlannedPublishJob[]> {
  const publishableDestinations = workflow.destinations.filter((destination) => isPublishable(workflow, destination));
  return Promise.all(
    publishableDestinations.map(async (destination) => ({
      workflowId: workflow.id,
      sourceItemId: sourceItem.id,
      workflowDestinationId: destination.id,
      idempotencyKey: await createPublishJobIdempotencyKey(sourceItem.id, destination.id),
      scheduledFor: scheduledTimeFor(workflow, now),
      dryRun: isDryRun(destination, dryRun),
    })),
  );
}
