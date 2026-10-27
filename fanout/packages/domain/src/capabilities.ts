import type { DestinationKind } from './kinds.ts';

const megabyte = 1024 * 1024;
const gigabyte = 1024 * megabyte;

export type Orientation = 'vertical' | 'square' | 'landscape';

/** Platform facts a publisher declares; media profiles and caption limits are derived from these. */
export interface PublisherCapabilities {
  acceptedContainers: readonly string[];
  orientation: Orientation;
  minimumDurationSeconds: number;
  maximumDurationSeconds: number;
  maximumFileSizeBytes: number;
  minimumFrameRate: number;
  maximumFrameRate: number;
  captionCharacterLimit: number;
  titleCharacterLimit: number | null;
  hashtagLimit: number | null;
  supportsScheduling: boolean;
  needsPublicUrl: boolean;
}

const verticalShortFormDefaults = {
  acceptedContainers: ['mp4'],
  orientation: 'vertical',
  minimumDurationSeconds: 3,
  minimumFrameRate: 23,
  maximumFrameRate: 60,
  titleCharacterLimit: null,
  hashtagLimit: null,
  supportsScheduling: false,
  needsPublicUrl: true,
} as const satisfies Partial<PublisherCapabilities>;

/**
 * Per-destination platform limits. Sources and verification status are tracked in PROGRESS.md;
 * when a platform's current docs disagree, update the number here and note it there.
 */
export const destinationCapabilities: Record<DestinationKind, PublisherCapabilities> = {
  instagram_reels: { ...verticalShortFormDefaults, maximumDurationSeconds: 15 * 60, maximumFileSizeBytes: 300 * megabyte, captionCharacterLimit: 2200, hashtagLimit: 30 },
  instagram_stories: { ...verticalShortFormDefaults, minimumDurationSeconds: 3, maximumDurationSeconds: 60, maximumFileSizeBytes: 100 * megabyte, captionCharacterLimit: 0 },
  instagram_feed: { ...verticalShortFormDefaults, orientation: 'square', maximumDurationSeconds: 60 * 60, maximumFileSizeBytes: 300 * megabyte, captionCharacterLimit: 2200, hashtagLimit: 30 },
  facebook_reels: { ...verticalShortFormDefaults, maximumDurationSeconds: 90, maximumFileSizeBytes: 1 * gigabyte, captionCharacterLimit: 2200, supportsScheduling: true, needsPublicUrl: false },
  youtube_shorts: { ...verticalShortFormDefaults, minimumDurationSeconds: 1, maximumDurationSeconds: 180, maximumFileSizeBytes: 256 * gigabyte, captionCharacterLimit: 5000, titleCharacterLimit: 100, hashtagLimit: 60, supportsScheduling: true, needsPublicUrl: false },
  tiktok: { ...verticalShortFormDefaults, maximumDurationSeconds: 10 * 60, maximumFileSizeBytes: 4 * gigabyte, captionCharacterLimit: 2200 },
  linkedin: { ...verticalShortFormDefaults, maximumDurationSeconds: 30 * 60, maximumFileSizeBytes: 500 * megabyte, minimumFrameRate: 10, captionCharacterLimit: 3000, needsPublicUrl: false },
  threads: { ...verticalShortFormDefaults, minimumDurationSeconds: 1, maximumDurationSeconds: 5 * 60, maximumFileSizeBytes: 1 * gigabyte, captionCharacterLimit: 500, hashtagLimit: 1 },
  pinterest: { ...verticalShortFormDefaults, minimumDurationSeconds: 4, maximumDurationSeconds: 15 * 60, maximumFileSizeBytes: 2 * gigabyte, captionCharacterLimit: 500, titleCharacterLimit: 100, needsPublicUrl: false },
  x: { ...verticalShortFormDefaults, minimumDurationSeconds: 1, maximumDurationSeconds: 140, maximumFileSizeBytes: 512 * megabyte, minimumFrameRate: 1, captionCharacterLimit: 280, needsPublicUrl: false },
  archive: { ...verticalShortFormDefaults, minimumDurationSeconds: 0, maximumDurationSeconds: Number.MAX_SAFE_INTEGER, maximumFileSizeBytes: Number.MAX_SAFE_INTEGER, minimumFrameRate: 1, maximumFrameRate: 120, captionCharacterLimit: Number.MAX_SAFE_INTEGER, needsPublicUrl: false },
};
