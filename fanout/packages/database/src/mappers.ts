import { mediaMetadataSchema, scheduleSlotSchema, type Asset, type Connection, type Platform, type PublishJob, type SourceItem, type Workflow, type WorkflowDestination } from '@fanout/domain';
import type { assets, connections, publishJobs, sourceItems, workflowDestinations, workflows } from './schema.ts';
import type { TokenCipher } from './tokenCipher.ts';

type Row<Table extends { $inferSelect: unknown }> = Table['$inferSelect'];

const scheduleSlotsSchema = scheduleSlotSchema.array();

export function toConnection(row: Row<typeof connections>, tokenCipher: TokenCipher): Connection {
  return {
    ...row,
    platform: row.platform as Platform,
    tokenSet: row.encryptedTokenSet ? tokenCipher.decrypt(row.encryptedTokenSet) : null,
  };
}

export function toWorkflowDestination(row: Row<typeof workflowDestinations>): WorkflowDestination {
  const { position: _position, ...destination } = row;
  return destination;
}

export function toWorkflow(row: Row<typeof workflows>, destinationRows: Row<typeof workflowDestinations>[]): Workflow {
  return {
    ...row,
    scheduleSlots: scheduleSlotsSchema.parse(row.scheduleSlots),
    destinations: [...destinationRows].sort((left, right) => left.position - right.position).map(toWorkflowDestination),
  };
}

export function toSourceItem(row: Row<typeof sourceItems>): SourceItem {
  const { createdAt: _createdAt, ...sourceItem } = row;
  return { ...sourceItem, masterMetadata: mediaMetadataSchema.parse(row.masterMetadata) };
}

export function toAsset(row: Row<typeof assets>): Asset {
  return { ...row, metadata: mediaMetadataSchema.parse(row.metadata) };
}

export function toPublishJob(row: Row<typeof publishJobs>): PublishJob {
  return row;
}
