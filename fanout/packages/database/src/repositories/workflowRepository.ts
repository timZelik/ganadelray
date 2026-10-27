import { and, eq, inArray } from 'drizzle-orm';
import type { DestinationKind, FitMode, PublisherRoute, ScheduleSlot, Workflow, WorkflowDestination, WorkflowMode } from '@fanout/domain';
import type { Database } from '../client.ts';
import { toWorkflow } from '../mappers.ts';
import { workflowDestinations, workflows } from '../schema.ts';

export interface NewWorkflowDestination {
  destinationKind: DestinationKind;
  publisherRoute: PublisherRoute;
  connectionId?: string | null;
  captionTemplate?: string;
  hashtags?: string[];
  mediaProfileOverride?: Record<string, unknown>;
  publisherSettings?: Record<string, unknown>;
}

export interface NewWorkflow {
  name: string;
  sourceConnectionId: string;
  mode?: WorkflowMode;
  fitMode?: FitMode;
  scheduleSlots?: ScheduleSlot[];
  destinations: NewWorkflowDestination[];
}

export function createWorkflowRepository(database: Database) {
  async function hydrate(workflowRows: (typeof workflows.$inferSelect)[]): Promise<Workflow[]> {
    if (workflowRows.length === 0) return [];
    const destinationRows = await database.select().from(workflowDestinations).where(inArray(workflowDestinations.workflowId, workflowRows.map((row) => row.id)));
    return workflowRows.map((row) => toWorkflow(row, destinationRows.filter((destination) => destination.workflowId === row.id)));
  }

  return {
    async create({ destinations, ...workflow }: NewWorkflow): Promise<Workflow> {
      const workflowId = await database.transaction(async (transaction) => {
        const [row] = await transaction.insert(workflows).values(workflow).returning({ id: workflows.id });
        await transaction.insert(workflowDestinations).values(destinations.map((destination, position) => ({ ...destination, workflowId: row!.id, position })));
        return row!.id;
      });
      return (await this.findById(workflowId))!;
    },
    async findById(workflowId: string): Promise<Workflow | null> {
      const [workflow] = await hydrate(await database.select().from(workflows).where(eq(workflows.id, workflowId)));
      return workflow ?? null;
    },
    async listAll(): Promise<Workflow[]> {
      return hydrate(await database.select().from(workflows).orderBy(workflows.createdAt));
    },
    async listEnabledForSource(sourceConnectionId: string): Promise<Workflow[]> {
      return hydrate(await database.select().from(workflows).where(and(eq(workflows.sourceConnectionId, sourceConnectionId), eq(workflows.enabled, true))));
    },
    async updateDestination(workflowDestinationId: string, changes: Partial<Pick<WorkflowDestination, 'enabled' | 'publisherRoute' | 'connectionId' | 'captionTemplate' | 'hashtags' | 'publisherSettings'>>): Promise<void> {
      await database.update(workflowDestinations).set(changes).where(eq(workflowDestinations.id, workflowDestinationId));
    },
    async updateFitMode(workflowId: string, fitMode: FitMode): Promise<void> {
      await database.update(workflows).set({ fitMode }).where(eq(workflows.id, workflowId));
    },
    async listSourceConnectionIdsWithEnabledWorkflows(): Promise<string[]> {
      const rows = await database.selectDistinct({ sourceConnectionId: workflows.sourceConnectionId }).from(workflows).where(eq(workflows.enabled, true));
      return rows.map((row) => row.sourceConnectionId);
    },
  };
}

export type WorkflowRepository = ReturnType<typeof createWorkflowRepository>;
