import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { statusesThatCanTransitionTo, type DestinationKind, type ErrorKind, type PlannedPublishJob, type PublishJob, type PublishJobStatus, type PublisherRoute } from '@fanout/domain';
import type { Database } from '../client.ts';
import { toPublishJob } from '../mappers.ts';
import { publishJobs, sourceItems, workflowDestinations, workflows } from '../schema.ts';

export interface PublishJobChanges {
  externalPostId?: string | null;
  externalPostUrl?: string | null;
  lastError?: string | null;
  lastErrorKind?: ErrorKind | null;
  requestPreview?: unknown;
  publishedAt?: Date | null;
  scheduledFor?: Date | null;
  /** Counts a publish attempt in the same atomic update. */
  incrementAttemptCount?: boolean;
}

export interface PublishJobSummary extends PublishJob {
  workflowName: string;
  destinationKind: DestinationKind;
  publisherRoute: PublisherRoute;
  sourceItemTitle: string | null;
  sourceItemExternalId: string;
}

export interface ListPublishJobsOptions {
  limit: number;
  status?: PublishJobStatus;
}

function toColumnChanges({ incrementAttemptCount, ...changes }: PublishJobChanges) {
  return { ...changes, ...(incrementAttemptCount ? { attemptCount: sql`${publishJobs.attemptCount} + 1` } : {}) };
}

export function createPublishJobRepository(database: Database) {
  const summaryColumns = {
    job: publishJobs,
    workflowName: workflows.name,
    destinationKind: workflowDestinations.destinationKind,
    publisherRoute: workflowDestinations.publisherRoute,
    sourceItemTitle: sourceItems.title,
    sourceItemExternalId: sourceItems.externalId,
  };
  const summaryQuery = () =>
    database
      .select(summaryColumns)
      .from(publishJobs)
      .innerJoin(workflows, eq(publishJobs.workflowId, workflows.id))
      .innerJoin(workflowDestinations, eq(publishJobs.workflowDestinationId, workflowDestinations.id))
      .innerJoin(sourceItems, eq(publishJobs.sourceItemId, sourceItems.id));
  const toSummary = ({ job, ...joined }: Awaited<ReturnType<typeof summaryQuery>>[number]): PublishJobSummary => ({ ...toPublishJob(job), ...joined });

  return {
    /** Idempotent fan-out: returns every job for the planned keys, whether inserted now or by an earlier run. */
    async insertPlanned(plannedJobs: PlannedPublishJob[]): Promise<PublishJob[]> {
      if (plannedJobs.length === 0) return [];
      await database.insert(publishJobs).values(plannedJobs).onConflictDoNothing({ target: publishJobs.idempotencyKey });
      const rows = await database.select().from(publishJobs).where(inArray(publishJobs.idempotencyKey, plannedJobs.map((job) => job.idempotencyKey)));
      return rows.map(toPublishJob);
    },
    async findById(publishJobId: string): Promise<PublishJob | null> {
      const row = await database.query.publishJobs.findFirst({ where: eq(publishJobs.id, publishJobId) });
      return row ? toPublishJob(row) : null;
    },
    /**
     * Atomic compare-and-set on status: succeeds only if the job is currently in a state that may move to `to`.
     * Returns null when another worker got there first, which is what prevents double publishing.
     */
    async transition(publishJobId: string, to: PublishJobStatus, changes: PublishJobChanges = {}): Promise<PublishJob | null> {
      const [row] = await database
        .update(publishJobs)
        .set({ status: to, ...toColumnChanges(changes) })
        .where(and(eq(publishJobs.id, publishJobId), inArray(publishJobs.status, statusesThatCanTransitionTo(to))))
        .returning();
      return row ? toPublishJob(row) : null;
    },
    async listSummaries({ limit, status }: ListPublishJobsOptions): Promise<PublishJobSummary[]> {
      const rows = await summaryQuery().where(status ? eq(publishJobs.status, status) : undefined).orderBy(desc(publishJobs.createdAt)).limit(limit);
      return rows.map(toSummary);
    },
    async findSummary(publishJobId: string): Promise<PublishJobSummary | null> {
      const [row] = await summaryQuery().where(eq(publishJobs.id, publishJobId));
      return row ? toSummary(row) : null;
    },
  };
}

export type PublishJobRepository = ReturnType<typeof createPublishJobRepository>;
