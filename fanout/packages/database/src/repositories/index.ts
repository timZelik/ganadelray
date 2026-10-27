import type { Database } from '../client.ts';
import type { TokenCipher } from '../tokenCipher.ts';
import { createAssetRepository } from './assetRepository.ts';
import { createAuditLogRepository } from './auditLogRepository.ts';
import { createConnectionRepository } from './connectionRepository.ts';
import { createPublishJobRepository } from './publishJobRepository.ts';
import { createSourceItemRepository } from './sourceItemRepository.ts';
import { createWatchCursorRepository } from './watchCursorRepository.ts';
import { createWorkflowRepository } from './workflowRepository.ts';

export * from './assetRepository.ts';
export * from './auditLogRepository.ts';
export * from './connectionRepository.ts';
export * from './publishJobRepository.ts';
export * from './sourceItemRepository.ts';
export * from './watchCursorRepository.ts';
export * from './workflowRepository.ts';

export function createRepositories(database: Database, tokenCipher: TokenCipher) {
  return {
    connectionRepository: createConnectionRepository(database, tokenCipher),
    workflowRepository: createWorkflowRepository(database),
    sourceItemRepository: createSourceItemRepository(database),
    assetRepository: createAssetRepository(database),
    publishJobRepository: createPublishJobRepository(database),
    watchCursorRepository: createWatchCursorRepository(database),
    auditLogRepository: createAuditLogRepository(database),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
