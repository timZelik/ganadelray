import { createDryRunHttpClient, createHttpClient, type DryRunHttpClient, type HttpClient, type Publisher, type PublishAttempt } from '@fanout/connectors-core';
import { PermanentError, ReauthRequiredError, type Connection, type WorkflowDestination } from '@fanout/domain';
import { withCorrelationId } from '@fanout/logging';
import { delayJobUntil, publishJobReferenceSchema, runWithErrorPolicy, type RateLimitRule } from '@fanout/queue';
import type { Job } from 'bullmq';
import type { WorkerDependencies } from '../dependencies.ts';
import { buildPostDraft } from '../pipeline/postDraft.ts';
import { toPreparedAsset } from '../pipeline/preparedAsset.ts';
import { loadPublishJobContext, type PublishJobContext } from '../pipeline/publishJobContext.ts';
import { publishJobFailureHooks } from '../pipeline/publishJobFailures.ts';

function rateLimitRulesFor(publisher: Publisher, destination: WorkflowDestination): RateLimitRule[] {
  const { platformKey, windows } = publisher.rateLimitPolicy;
  return windows.map((window) => ({
    key: window.scope === 'platform' ? `platform:${platformKey}` : `connection:${destination.connectionId ?? `${platformKey}-unconnected`}`,
    maximumOperations: window.maximumOperations,
    windowMilliseconds: window.windowMilliseconds,
  }));
}

async function resolveConnection({ repositories }: WorkerDependencies, { destination, publisher }: PublishJobContext): Promise<Connection | null> {
  if (!destination.connectionId) {
    if (publisher.requiresConnection) throw new PermanentError(`${destination.destinationKind} via ${destination.publisherRoute} needs a connected account`);
    return null;
  }
  const connection = await repositories.connectionRepository.findById(destination.connectionId);
  if (!connection) throw new PermanentError(`Connection ${destination.connectionId} no longer exists`);
  if (connection.status !== 'active') throw new ReauthRequiredError(`Connection ${connection.accountHandle} needs to be reconnected`, { connectionId: connection.id });
  return connection;
}

function httpClientFor(dependencies: WorkerDependencies, dryRun: boolean, logger: WorkerDependencies['logger']): HttpClient | DryRunHttpClient {
  return dryRun ? createDryRunHttpClient(logger) : createHttpClient({ auditSink: dependencies.repositories.auditLogRepository, logger });
}

async function recordOutcome({ repositories, now }: WorkerDependencies, publishJobId: string, attempt: PublishAttempt): Promise<void> {
  const nextStatus = attempt.outcome === 'processing' ? 'processing' : 'published';
  await repositories.publishJobRepository.transition(publishJobId, nextStatus, {
    externalPostId: attempt.externalPostId,
    externalPostUrl: attempt.externalPostUrl,
    requestPreview: attempt.requestPreview,
    publishedAt: nextStatus === 'published' ? now() : null,
    lastError: null,
    lastErrorKind: null,
  });
}

/** Rate-limit → claim → validate → publish (or dry-run) → record. The status claim is what makes double posting impossible. */
export function createPublishProcessor(dependencies: WorkerDependencies) {
  const { repositories, rateLimiter, storage, settings } = dependencies;
  return async function processPublishJob(job: Job, token?: string): Promise<void> {
    const { publishJobId } = publishJobReferenceSchema.parse(job.data);
    const logger = withCorrelationId(dependencies.logger, publishJobId);
    let connectionId: string | null = null;
    await runWithErrorPolicy(job, publishJobFailureHooks(dependencies, publishJobId, () => connectionId), async () => {
      const pending = await repositories.publishJobRepository.findById(publishJobId);
      if (!pending || !['queued', 'preparing'].includes(pending.status)) return;
      const context = await loadPublishJobContext(dependencies, pending);
      connectionId = context.destination.connectionId;
      if (!pending.dryRun) {
        const decision = await rateLimiter.acquire(rateLimitRulesFor(context.publisher, context.destination), `${publishJobId}-${job.attemptsMade}`);
        if (!decision.allowed) await delayJobUntil(job, token, Date.now() + decision.retryAfterMilliseconds);
      }
      const publishJob = await repositories.publishJobRepository.transition(publishJobId, 'publishing', { incrementAttemptCount: true });
      if (!publishJob) return;
      const connection = await resolveConnection(dependencies, context);
      const asset = await repositories.assetRepository.findLiveForDestination(context.sourceItem.id, context.destination.id, dependencies.now());
      if (!asset) throw new PermanentError('The rendered asset expired before publishing; retry the job to render it again');
      const preparedAsset = await toPreparedAsset(asset, storage, context.publisher.capabilities.needsPublicUrl, settings.presignedUrlTtlSeconds);
      const post = await buildPostDraft(dependencies, context);
      const validation = context.publisher.validate(preparedAsset, post);
      if (!validation.valid) throw new PermanentError(`Not publishable to ${context.destination.destinationKind}: ${validation.problems.join('; ')}`);
      const http = httpClientFor(dependencies, publishJob.dryRun, logger);
      const attempt = await context.publisher.publish(connection, preparedAsset, post, { dryRun: publishJob.dryRun, correlationId: publishJobId, logger, http, publisherSettings: context.destination.publisherSettings });
      const recordedRequests = 'recordedRequests' in http ? http.recordedRequests() : [];
      await recordOutcome(dependencies, publishJobId, { ...attempt, requestPreview: attempt.requestPreview ?? recordedRequests });
      logger.info({ destinationKind: context.destination.destinationKind, outcome: attempt.outcome }, 'Publish step finished');
    });
  };
}
