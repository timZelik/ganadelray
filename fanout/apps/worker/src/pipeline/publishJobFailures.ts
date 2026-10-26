import type { ErrorPolicyHooks, FinalFailure } from '@fanout/queue';
import { ReauthRequiredError } from '@fanout/domain';
import type { WorkerDependencies } from '../dependencies.ts';

async function flagConnectionForReauth({ repositories }: WorkerDependencies, { error }: FinalFailure, fallbackConnectionId: string | null): Promise<void> {
  const connectionId = (error instanceof ReauthRequiredError ? error.connectionId : null) ?? fallbackConnectionId;
  if (connectionId) await repositories.connectionRepository.updateStatus(connectionId, 'needs_reauth');
}

/** How prepare/publish failures land on the publish job row the dashboard shows. */
export function publishJobFailureHooks(dependencies: WorkerDependencies, publishJobId: string, connectionId: () => string | null): ErrorPolicyHooks {
  const { publishJobRepository } = dependencies.repositories;
  return {
    async onFinalFailure(failure) {
      await publishJobRepository.transition(publishJobId, 'failed', { lastError: failure.message, lastErrorKind: failure.kind });
      if (failure.kind === 'reauth_required') await flagConnectionForReauth(dependencies, failure, connectionId());
      dependencies.logger.error({ correlationId: publishJobId, errorKind: failure.kind, error: failure.message }, 'Publish job failed');
    },
    async onRetryScheduled(failure) {
      await publishJobRepository.transition(publishJobId, 'queued', { lastError: failure.message, lastErrorKind: failure.kind });
      dependencies.logger.warn({ correlationId: publishJobId, error: failure.message }, 'Publish job will be retried');
    },
  };
}
