import type { PublishJobView } from '@fanout/api-contract';
import type { PublishJobSummary } from '@fanout/database';
import { isRetryable } from '@fanout/domain';

const toIsoString = (date: Date | null) => date?.toISOString() ?? null;

export function presentPublishJob(summary: PublishJobSummary): PublishJobView {
  return {
    id: summary.id,
    status: summary.status,
    dryRun: summary.dryRun,
    attemptCount: summary.attemptCount,
    destinationKind: summary.destinationKind,
    publisherRoute: summary.publisherRoute,
    workflowName: summary.workflowName,
    sourceItemTitle: summary.sourceItemTitle,
    sourceItemExternalId: summary.sourceItemExternalId,
    scheduledFor: toIsoString(summary.scheduledFor),
    publishedAt: toIsoString(summary.publishedAt),
    externalPostId: summary.externalPostId,
    externalPostUrl: summary.externalPostUrl,
    lastError: summary.lastError,
    lastErrorKind: summary.lastErrorKind,
    requestPreview: summary.requestPreview,
    createdAt: summary.createdAt.toISOString(),
    updatedAt: summary.updatedAt.toISOString(),
    canRetry: isRetryable(summary.status),
  };
}
