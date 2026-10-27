import type { BufferAccountSummary } from '@fanout/connector-buffer';
import type { ConnectionRepository, PublishJobRepository, SourceItemRepository, WorkflowRepository } from '@fanout/database';
import type { Logger } from '@fanout/logging';
import type { PipelineQueues } from '@fanout/queue';
import type { ObjectStorage } from '@fanout/storage';
import type { Authentication } from './authentication/authentication.ts';

/** Only what the HTTP layer needs, so routes can be tested with in-memory fakes. */
export interface ApiDependencies {
  publishJobRepository: Pick<PublishJobRepository, 'listSummaries' | 'findSummary' | 'transition' | 'listSummariesForSourceItems'>;
  sourceItemRepository: Pick<SourceItemRepository, 'listRecent' | 'findById'>;
  workflowRepository: Pick<WorkflowRepository, 'listAll' | 'updateDestination' | 'updateFitMode'>;
  connectionRepository: Pick<ConnectionRepository, 'findByPlatformAndHandle' | 'create' | 'replaceCredentials' | 'delete'>;
  storage: Pick<ObjectStorage, 'upload' | 'openReadStream' | 'deleteObject'>;
  queues: Pick<PipelineQueues, 'enqueuePrepare' | 'enqueueIngest' | 'findIngestOutcome'> & Partial<Pick<PipelineQueues, 'watch' | 'ingest' | 'prepare' | 'publish' | 'maintenance'>>;
  authentication: Authentication;
  /** Validates a Buffer API key and lists its channels. */
  fetchBufferAccount(apiKey: string): Promise<BufferAccountSummary>;
  logger: Logger;
  dryRun: boolean;
  publicUrl: string;
  maximumUploadBytes: number;
  now: () => Date;
}
