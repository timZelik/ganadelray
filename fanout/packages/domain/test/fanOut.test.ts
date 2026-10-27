import { describe, expect, it } from 'vitest';
import { planPublishJobs, type SourceItem, type Workflow, type WorkflowDestination } from '../src/index.ts';

const now = new Date('2026-10-26T12:00:00Z');

function buildDestination(id: string, enabled = true): WorkflowDestination {
  return { id, workflowId: 'workflow-1', destinationKind: 'tiktok', publisherRoute: 'console', connectionId: null, captionTemplate: '{{originalCaption}}', hashtags: [], mediaProfileOverride: {}, publisherSettings: {}, enabled };
}

function buildWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'workflow-1', name: 'Hub to everywhere', sourceConnectionId: 'connection-1', mode: 'auto_new', fitMode: 'pad', scheduleSlots: [], enabled: true,
    destinations: [buildDestination('destination-1'), buildDestination('destination-2', false), buildDestination('destination-3')],
    createdAt: now, updatedAt: now, ...overrides,
  };
}

const sourceItem = { id: 'source-item-1' } as SourceItem;

describe('planPublishJobs', () => {
  it('plans one immediate job per enabled destination in auto_new mode', async () => {
    const planned = await planPublishJobs({ workflow: buildWorkflow(), sourceItem, now, dryRun: true });
    expect(planned.map((job) => job.workflowDestinationId)).toEqual(['destination-1', 'destination-3']);
    expect(planned.every((job) => job.scheduledFor === now && job.dryRun)).toBe(true);
  });

  it('always dry-runs destinations routed to the console stand-in', async () => {
    const workflow = buildWorkflow({ destinations: [{ ...buildDestination('console-1'), publisherRoute: 'console' }, { ...buildDestination('buffer-1'), publisherRoute: 'buffer' }] });
    const planned = await planPublishJobs({ workflow, sourceItem, now, dryRun: false });
    expect(planned.map((job) => [job.workflowDestinationId, job.dryRun])).toEqual([['console-1', true], ['buffer-1', false]]);
  });

  it('leaves backlog jobs unscheduled for the slot scheduler', async () => {
    const planned = await planPublishJobs({ workflow: buildWorkflow({ mode: 'backlog' }), sourceItem, now, dryRun: false });
    expect(planned.every((job) => job.scheduledFor === null)).toBe(true);
  });

  it('plans nothing for a disabled workflow', async () => {
    expect(await planPublishJobs({ workflow: buildWorkflow({ enabled: false }), sourceItem, now, dryRun: true })).toEqual([]);
  });
});
