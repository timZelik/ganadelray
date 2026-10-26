import { z } from 'zod';

export const sourceKinds = ['local_folder', 'google_drive', 'dropbox', 's3', 'instagram', 'youtube', 'tiktok', 'rss'] as const;
export const sourceKindSchema = z.enum(sourceKinds);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const destinationKinds = [
  'instagram_reels',
  'instagram_stories',
  'instagram_feed',
  'facebook_reels',
  'youtube_shorts',
  'tiktok',
  'linkedin',
  'threads',
  'pinterest',
  'x',
  'archive',
] as const;
export const destinationKindSchema = z.enum(destinationKinds);
export type DestinationKind = z.infer<typeof destinationKindSchema>;

/** How a destination is reached: the platform's own API, a publishing proxy, or the logging stand-in. */
export const publisherRoutes = ['direct', 'buffer', 'upload_post', 'console'] as const;
export const publisherRouteSchema = z.enum(publisherRoutes);
export type PublisherRoute = z.infer<typeof publisherRouteSchema>;

export const connectionStatuses = ['active', 'needs_reauth', 'revoked'] as const;
export const connectionStatusSchema = z.enum(connectionStatuses);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const workflowModes = ['auto_new', 'backlog'] as const;
export const workflowModeSchema = z.enum(workflowModes);
export type WorkflowMode = z.infer<typeof workflowModeSchema>;

export const fitModes = ['pad', 'crop'] as const;
export const fitModeSchema = z.enum(fitModes);
export type FitMode = z.infer<typeof fitModeSchema>;
