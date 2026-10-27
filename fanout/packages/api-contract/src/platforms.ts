import { destinationKindSchema, fitModeSchema } from '@fanout/domain';
import { z } from 'zod';

export const bufferChannelViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  service: z.string(),
  avatar: z.string().nullable(),
});
export type BufferChannelView = z.infer<typeof bufferChannelViewSchema>;

export const destinationSettingsViewSchema = z.object({
  id: z.uuid(),
  destinationKind: destinationKindSchema,
  enabled: z.boolean(),
  channelId: z.string().nullable(),
  captionTemplate: z.string(),
  hashtags: z.array(z.string()),
  /** The connected Buffer accounts that can post to this platform. */
  channelOptions: z.array(bufferChannelViewSchema),
  /** live: posts for real through Buffer. practice: shows what it would post. */
  mode: z.enum(['live', 'practice']),
});
export type DestinationSettingsView = z.infer<typeof destinationSettingsViewSchema>;

export const platformsResponseSchema = z.object({
  buffer: z.object({
    connected: z.boolean(),
    needsReconnect: z.boolean(),
    organizationName: z.string().nullable(),
    channels: z.array(bufferChannelViewSchema),
  }),
  /** False while the server runs with PUBLISH_DRY_RUN=true: nothing can post for real. */
  livePostingEnabled: z.boolean(),
  fitMode: fitModeSchema,
  destinations: z.array(destinationSettingsViewSchema),
});
export type PlatformsResponse = z.infer<typeof platformsResponseSchema>;

export const connectBufferRequestSchema = z.object({ apiKey: z.string().trim().min(10, 'That does not look like a Buffer API key') });

export const destinationParametersSchema = z.object({ destinationId: z.uuid() });

export const updateDestinationRequestSchema = z.object({
  enabled: z.boolean().optional(),
  channelId: z.string().nullable().optional(),
  captionTemplate: z.string().max(5000).optional(),
  hashtags: z.array(z.string().max(100)).max(30).optional(),
});
export type UpdateDestinationRequest = z.infer<typeof updateDestinationRequestSchema>;

export const updateFitModeRequestSchema = z.object({ fitMode: fitModeSchema });
