import { z } from 'zod';

/** What ffprobe told us about a file, normalized; persisted on source items and assets. */
export const mediaMetadataSchema = z.object({
  formatName: z.string(),
  /** ffprobe reports MOV and MP4 alike in formatName; the brand tells them apart ('qt  ' is QuickTime). */
  majorBrand: z.string().nullable(),
  durationSeconds: z.number().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
  /** Display dimensions, i.e. after applying rotation metadata. */
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  rotationDegrees: z.number().int(),
  frameRate: z.number().nonnegative(),
  videoCodec: z.string(),
  videoProfile: z.string().nullable(),
  pixelFormat: z.string().nullable(),
  audioCodec: z.string().nullable(),
  audioSampleRateHz: z.number().int().nullable(),
  hasFastStart: z.boolean(),
});
export type MediaMetadata = z.infer<typeof mediaMetadataSchema>;
