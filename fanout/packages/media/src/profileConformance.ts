import type { MediaMetadata } from '@fanout/domain';
import type { MediaProfile } from './mediaProfile.ts';

const quickTimeBrand = 'qt';

type ConformanceCheck = (metadata: MediaMetadata, profile: MediaProfile) => string | null;

const conformanceChecks: ConformanceCheck[] = [
  ({ formatName, majorBrand }) => (!formatName.includes('mp4') || majorBrand === quickTimeBrand ? `container is ${majorBrand ?? formatName}, not MP4` : null),
  ({ videoCodec }, { videoCodec: expected }) => (videoCodec !== expected ? `video codec is ${videoCodec}, not ${expected}` : null),
  ({ videoProfile }, { videoProfile: expected }) => (videoProfile !== expected ? `H.264 profile is ${videoProfile ?? 'unknown'}, not ${expected}` : null),
  ({ pixelFormat }, { pixelFormat: expected }) => (pixelFormat !== expected ? `pixel format is ${pixelFormat ?? 'unknown'}, not ${expected}` : null),
  ({ width, height }, profile) => (width !== profile.width || height !== profile.height ? `frame is ${width}×${height}, not ${profile.width}×${profile.height}` : null),
  ({ rotationDegrees }) => (rotationDegrees !== 0 ? `has ${rotationDegrees}° rotation metadata` : null),
  ({ frameRate }, { minimumFrameRate, maximumFrameRate }) => (frameRate < minimumFrameRate || frameRate > maximumFrameRate ? `frame rate ${frameRate} is outside ${minimumFrameRate}–${maximumFrameRate}` : null),
  ({ audioCodec }, { audioCodec: expected }) => (audioCodec !== expected ? `audio codec is ${audioCodec ?? 'missing'}, not ${expected}` : null),
  ({ audioSampleRateHz }, { audioSampleRateHz: expected }) => (audioSampleRateHz !== expected ? `audio sample rate is ${audioSampleRateHz ?? 'missing'}, not ${expected}` : null),
  ({ hasFastStart }) => (hasFastStart ? null : 'moov atom is not at the front (+faststart)'),
  ({ sizeBytes }, { maximumFileSizeBytes }) => (sizeBytes > maximumFileSizeBytes ? `file is larger than ${maximumFileSizeBytes} bytes` : null),
];

/** Every reason the master cannot be passed through untouched; an empty list means skip re-encoding. */
export function findProfileViolations(metadata: MediaMetadata, profile: MediaProfile): string[] {
  return conformanceChecks.map((check) => check(metadata, profile)).filter((violation) => violation !== null);
}
