import type { FitMode, Orientation, PublisherCapabilities } from '@fanout/domain';
import { z } from 'zod';

const frameDimensionsByOrientation: Record<Orientation, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

/** The tunables a workflow destination may override; everything else comes from platform capabilities. */
export const mediaProfileOverrideSchema = z
  .object({
    constantRateFactor: z.number().int().min(0).max(51),
    maximumVideoBitrateKilobits: z.number().int().positive(),
    audioBitrateKilobits: z.number().int().positive(),
    maximumFrameRate: z.number().positive(),
  })
  .partial()
  .strict();
export type MediaProfileOverride = z.infer<typeof mediaProfileOverrideSchema>;

export interface MediaProfile {
  container: 'mp4';
  videoCodec: 'h264';
  videoProfile: 'High';
  pixelFormat: 'yuv420p';
  audioCodec: 'aac';
  audioSampleRateHz: 48_000;
  audioChannels: 2;
  audioBitrateKilobits: number;
  width: number;
  height: number;
  minimumFrameRate: number;
  maximumFrameRate: number;
  constantRateFactor: number;
  maximumVideoBitrateKilobits: number;
  keyframeIntervalSeconds: number;
  fitMode: FitMode;
  maximumFileSizeBytes: number;
}

/** Destination capabilities + the workflow's pad/crop choice + per-destination overrides → one concrete encode target. */
export function resolveMediaProfile(capabilities: PublisherCapabilities, fitMode: FitMode, override: MediaProfileOverride = {}): MediaProfile {
  return {
    container: 'mp4',
    videoCodec: 'h264',
    videoProfile: 'High',
    pixelFormat: 'yuv420p',
    audioCodec: 'aac',
    audioSampleRateHz: 48_000,
    audioChannels: 2,
    audioBitrateKilobits: override.audioBitrateKilobits ?? 128,
    ...frameDimensionsByOrientation[capabilities.orientation],
    minimumFrameRate: capabilities.minimumFrameRate,
    maximumFrameRate: Math.min(override.maximumFrameRate ?? 30, capabilities.maximumFrameRate),
    constantRateFactor: override.constantRateFactor ?? 21,
    maximumVideoBitrateKilobits: override.maximumVideoBitrateKilobits ?? 8_000,
    keyframeIntervalSeconds: 2,
    fitMode,
    maximumFileSizeBytes: capabilities.maximumFileSizeBytes,
  };
}
