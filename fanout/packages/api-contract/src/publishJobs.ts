import { destinationKindSchema, errorKinds, publishJobStatusSchema, publisherRouteSchema } from '@fanout/domain';
import { z } from 'zod';

/** One row of the dashboard's job list; dates travel as ISO strings. */
export const publishJobViewSchema = z.object({
  id: z.uuid(),
  status: publishJobStatusSchema,
  dryRun: z.boolean(),
  attemptCount: z.number().int(),
  destinationKind: destinationKindSchema,
  publisherRoute: publisherRouteSchema,
  workflowName: z.string(),
  sourceItemTitle: z.string().nullable(),
  sourceItemExternalId: z.string(),
  scheduledFor: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  externalPostId: z.string().nullable(),
  externalPostUrl: z.string().nullable(),
  lastError: z.string().nullable(),
  lastErrorKind: z.enum(errorKinds).nullable(),
  requestPreview: z.unknown(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  canRetry: z.boolean(),
});
export type PublishJobView = z.infer<typeof publishJobViewSchema>;

export const listPublishJobsQuerySchema = z.object({
  status: publishJobStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListPublishJobsQuery = Partial<z.output<typeof listPublishJobsQuerySchema>>;

export const listPublishJobsResponseSchema = z.object({ jobs: z.array(publishJobViewSchema) });
export type ListPublishJobsResponse = z.infer<typeof listPublishJobsResponseSchema>;

export const publishJobParametersSchema = z.object({ publishJobId: z.uuid() });

export const retryPublishJobResponseSchema = z.object({ job: publishJobViewSchema });

export const errorResponseSchema = z.object({ error: z.string() });
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const healthResponseSchema = z.object({ status: z.literal('ok'), dryRun: z.boolean() });
