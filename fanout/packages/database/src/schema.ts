import { connectionStatuses, destinationKinds, errorKinds, fitModes, publishJobStatuses, publisherRoutes, workflowModes } from '@fanout/domain';
import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const connectionStatusEnum = pgEnum('connection_status', connectionStatuses);
export const workflowModeEnum = pgEnum('workflow_mode', workflowModes);
export const fitModeEnum = pgEnum('fit_mode', fitModes);
export const publishJobStatusEnum = pgEnum('publish_job_status', publishJobStatuses);
export const errorKindEnum = pgEnum('error_kind', errorKinds);
export const publisherRouteEnum = pgEnum('publisher_route', publisherRoutes);
export const destinationKindEnum = pgEnum('destination_kind', destinationKinds);

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

export const connections = pgTable('connections', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull(),
  accountHandle: text().notNull(),
  /** AES-256-GCM ciphertext of the TokenSet; never stored in plaintext. */
  encryptedTokenSet: text(),
  scopes: text().array().notNull().default(sql`'{}'::text[]`),
  expiresAt: timestamp({ withTimezone: true }),
  status: connectionStatusEnum().notNull().default('active'),
  settings: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
}, (table) => [uniqueIndex().on(table.platform, table.accountHandle)]);

export const workflows = pgTable('workflows', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  sourceConnectionId: uuid().notNull().references(() => connections.id, { onDelete: 'restrict' }),
  mode: workflowModeEnum().notNull().default('auto_new'),
  fitMode: fitModeEnum().notNull().default('pad'),
  scheduleSlots: jsonb().$type<unknown[]>().notNull().default([]),
  enabled: boolean().notNull().default(true),
  ...timestamps,
}, (table) => [index().on(table.sourceConnectionId)]);

export const workflowDestinations = pgTable('workflow_destinations', {
  id: uuid().primaryKey().defaultRandom(),
  workflowId: uuid().notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  destinationKind: destinationKindEnum().notNull(),
  publisherRoute: publisherRouteEnum().notNull(),
  connectionId: uuid().references(() => connections.id, { onDelete: 'restrict' }),
  captionTemplate: text().notNull().default('{{originalCaption}}\n\n{{hashtags}}'),
  hashtags: text().array().notNull().default(sql`'{}'::text[]`),
  mediaProfileOverride: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean().notNull().default(true),
  position: integer().notNull().default(0),
}, (table) => [index().on(table.workflowId)]);

export const sourceItems = pgTable('source_items', {
  id: uuid().primaryKey().defaultRandom(),
  sourceConnectionId: uuid().notNull().references(() => connections.id, { onDelete: 'cascade' }),
  externalId: text().notNull(),
  detectedAt: timestamp({ withTimezone: true }).notNull(),
  title: text(),
  originalCaption: text(),
  durationSeconds: doublePrecision().notNull(),
  masterStorageKey: text().notNull(),
  masterChecksum: text().notNull(),
  masterMetadata: jsonb().$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex().on(table.sourceConnectionId, table.externalId)]);

export const assets = pgTable('assets', {
  id: uuid().primaryKey().defaultRandom(),
  sourceItemId: uuid().notNull().references(() => sourceItems.id, { onDelete: 'cascade' }),
  workflowDestinationId: uuid().notNull().references(() => workflowDestinations.id, { onDelete: 'cascade' }),
  storageKey: text().notNull(),
  checksum: text().notNull(),
  renderFingerprint: text().notNull(),
  metadata: jsonb().$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  deletedAt: timestamp({ withTimezone: true }),
}, (table) => [
  uniqueIndex().on(table.sourceItemId, table.workflowDestinationId),
  index().on(table.sourceItemId, table.renderFingerprint),
  index().on(table.expiresAt).where(sql`${table.deletedAt} is null`),
]);

export const publishJobs = pgTable('publish_jobs', {
  id: uuid().primaryKey().defaultRandom(),
  workflowId: uuid().notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  sourceItemId: uuid().notNull().references(() => sourceItems.id, { onDelete: 'cascade' }),
  workflowDestinationId: uuid().notNull().references(() => workflowDestinations.id, { onDelete: 'cascade' }),
  idempotencyKey: text().notNull().unique(),
  status: publishJobStatusEnum().notNull().default('queued'),
  dryRun: boolean().notNull(),
  attemptCount: integer().notNull().default(0),
  scheduledFor: timestamp({ withTimezone: true }),
  externalPostId: text(),
  externalPostUrl: text(),
  lastError: text(),
  lastErrorKind: errorKindEnum(),
  requestPreview: jsonb(),
  publishedAt: timestamp({ withTimezone: true }),
  ...timestamps,
}, (table) => [index().on(table.status), index().on(table.createdAt), index().on(table.sourceItemId)]);

export const watchCursors = pgTable('watch_cursors', {
  connectionId: uuid().primaryKey().references(() => connections.id, { onDelete: 'cascade' }),
  cursor: jsonb(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid().primaryKey().defaultRandom(),
  correlationId: text().notNull(),
  connectionId: uuid().references(() => connections.id, { onDelete: 'set null' }),
  method: text().notNull(),
  endpoint: text().notNull(),
  statusCode: integer(),
  latencyMilliseconds: integer().notNull(),
  redactedRequestBody: jsonb(),
  redactedResponseBody: jsonb(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [index().on(table.correlationId), index().on(table.createdAt)]);
