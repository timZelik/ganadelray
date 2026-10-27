import type { AuditLogEntry } from '@fanout/domain';
import type { Database } from '../client.ts';
import { auditLogs } from '../schema.ts';

/** Implements the connectors' AuditSink: every external API call ends up here, already redacted. */
export function createAuditLogRepository(database: Database) {
  return {
    async record(entry: AuditLogEntry): Promise<void> {
      await database.insert(auditLogs).values({ ...entry, latencyMilliseconds: Math.round(entry.latencyMilliseconds) });
    },
  };
}

export type AuditLogRepository = ReturnType<typeof createAuditLogRepository>;
