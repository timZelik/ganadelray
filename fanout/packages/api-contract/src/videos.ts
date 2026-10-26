import { destinationKindSchema } from '@fanout/domain';
import { z } from 'zod';
import { friendlyPostStates } from './friendlyStates.ts';

export const postViewSchema = z.object({
  publishJobId: z.uuid(),
  destinationKind: destinationKindSchema,
  state: z.enum(friendlyPostStates),
  problem: z.string().nullable(),
  postUrl: z.string().nullable(),
  canRetry: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export type PostView = z.infer<typeof postViewSchema>;

export const videoViewSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  caption: z.string().nullable(),
  durationSeconds: z.number(),
  createdAt: z.iso.datetime(),
  thumbnailUrl: z.string().nullable(),
  posts: z.array(postViewSchema),
});
export type VideoView = z.infer<typeof videoViewSchema>;

export const listVideosResponseSchema = z.object({ videos: z.array(videoViewSchema) });
export type ListVideosResponse = z.infer<typeof listVideosResponseSchema>;

export const videoParametersSchema = z.object({ videoId: z.uuid() });

export const uploadResponseSchema = z.object({ uploadId: z.uuid() });
export type UploadResponse = z.infer<typeof uploadResponseSchema>;

export const uploadParametersSchema = z.object({ uploadId: z.uuid() });

export const uploadStatusResponseSchema = z.object({
  state: z.enum(['processing', 'done', 'failed']),
  problem: z.string().nullable(),
  videoId: z.uuid().nullable(),
});
export type UploadStatusResponse = z.infer<typeof uploadStatusResponseSchema>;

/** The form fields the upload endpoint reads; text fields must come before the file. */
export const uploadFormFields = { caption: 'caption', title: 'title', file: 'video' } as const;
