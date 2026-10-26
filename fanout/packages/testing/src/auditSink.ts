import type { AuditLogEntry } from '@fanout/domain';

export interface RecordingAuditSink {
  entries: AuditLogEntry[];
  record(entry: AuditLogEntry): Promise<void>;
}

export function createRecordingAuditSink(): RecordingAuditSink {
  const entries: AuditLogEntry[] = [];
  return { entries, record: async (entry) => void entries.push(entry) };
}
