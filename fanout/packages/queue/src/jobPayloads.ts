import { z } from 'zod';

export const queueNames = {
  watch: 'watch',
  ingest: 'ingest',
  prepare: 'prepare',
  publish: 'publish',
  maintenance: 'maintenance',
} as const;
export type QueueName = (typeof queueNames)[keyof typeof queueNames];

export const watchJobSchema = z.object({ connectionId: z.uuid() });

export const ingestJobSchema = z.object({
  connectionId: z.uuid(),
  candidate: z.object({
    externalId: z.string().min(1),
    title: z.string().nullable(),
    originalCaption: z.string().nullable(),
    detectedAt: z.iso.datetime(),
    locator: z.record(z.string(), z.string()),
  }),
});

export const publishJobReferenceSchema = z.object({ publishJobId: z.uuid() });

export const maintenanceJobSchema = z.object({ task: z.enum(['purge_expired_assets']) });

/** Payloads are validated on the way out of Redis too: a queue is an external boundary. */
export const jobPayloadSchemas = {
  [queueNames.watch]: watchJobSchema,
  [queueNames.ingest]: ingestJobSchema,
  [queueNames.prepare]: publishJobReferenceSchema,
  [queueNames.publish]: publishJobReferenceSchema,
  [queueNames.maintenance]: maintenanceJobSchema,
} as const satisfies Record<QueueName, z.ZodType>;

export type JobPayload<Name extends QueueName> = z.infer<(typeof jobPayloadSchemas)[Name]>;
