import type { DestinationKind, ConnectionStatus, FitMode, PublisherRoute, SourceKind, WorkflowMode } from './kinds.ts';
import type { MediaMetadata } from './mediaMetadata.ts';
import type { PublishJobStatus } from './publishJobStatus.ts';
import type { ScheduleSlot } from './schedule.ts';
import type { ErrorKind } from './errors.ts';

export type Platform = SourceKind | DestinationKind | PublisherRoute;

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  tokenType: string | null;
}

export interface Connection {
  id: string;
  platform: Platform;
  accountHandle: string;
  tokenSet: TokenSet | null;
  scopes: string[];
  expiresAt: Date | null;
  status: ConnectionStatus;
  /** Non-secret, connector-specific settings, e.g. the folder a local hub watches. */
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowDestination {
  id: string;
  workflowId: string;
  destinationKind: DestinationKind;
  publisherRoute: PublisherRoute;
  connectionId: string | null;
  captionTemplate: string;
  hashtags: string[];
  mediaProfileOverride: Record<string, unknown>;
  enabled: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  sourceConnectionId: string;
  mode: WorkflowMode;
  fitMode: FitMode;
  scheduleSlots: ScheduleSlot[];
  enabled: boolean;
  destinations: WorkflowDestination[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SourceItem {
  id: string;
  sourceConnectionId: string;
  externalId: string;
  detectedAt: Date;
  title: string | null;
  originalCaption: string | null;
  durationSeconds: number;
  masterStorageKey: string;
  masterChecksum: string;
  masterMetadata: MediaMetadata;
}

export interface Asset {
  id: string;
  sourceItemId: string;
  workflowDestinationId: string;
  storageKey: string;
  checksum: string;
  renderFingerprint: string;
  metadata: MediaMetadata;
  createdAt: Date;
  expiresAt: Date;
  deletedAt: Date | null;
}

export interface PublishJob {
  id: string;
  workflowId: string;
  sourceItemId: string;
  workflowDestinationId: string;
  idempotencyKey: string;
  status: PublishJobStatus;
  dryRun: boolean;
  attemptCount: number;
  scheduledFor: Date | null;
  externalPostId: string | null;
  externalPostUrl: string | null;
  lastError: string | null;
  lastErrorKind: ErrorKind | null;
  /** In dry-run mode: the exact request the publisher would have sent. */
  requestPreview: unknown;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchCursor {
  connectionId: string;
  cursor: unknown;
  updatedAt: Date;
}

export interface AuditLogEntry {
  correlationId: string;
  connectionId: string | null;
  method: string;
  endpoint: string;
  statusCode: number | null;
  latencyMilliseconds: number;
  redactedRequestBody: unknown;
  redactedResponseBody: unknown;
}
