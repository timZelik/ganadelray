import type { PublishJobRepository } from '@fanout/database';
import type { Logger } from '@fanout/logging';
import type { PipelineQueues } from '@fanout/queue';

/** Only what the HTTP layer needs, so routes can be tested with in-memory fakes. */
export interface ApiDependencies {
  publishJobRepository: Pick<PublishJobRepository, 'listSummaries' | 'findSummary' | 'transition'>;
  queues: Pick<PipelineQueues, 'enqueuePrepare'> & Partial<Pick<PipelineQueues, 'watch' | 'ingest' | 'prepare' | 'publish' | 'maintenance'>>;
  logger: Logger;
  dryRun: boolean;
  now: () => Date;
}
