import type { MediaMetadata } from '@fanout/domain';

export const testEncryptionKey = Buffer.alloc(32, 42).toString('base64');

export function buildMediaMetadata(overrides: Partial<MediaMetadata> = {}): MediaMetadata {
  return {
    formatName: 'mov,mp4,m4a,3gp,3g2,mj2', majorBrand: 'isom', durationSeconds: 12, sizeBytes: 2_000_000, width: 1080, height: 1920, rotationDegrees: 0,
    frameRate: 30, videoCodec: 'h264', videoProfile: 'High', pixelFormat: 'yuv420p', audioCodec: 'aac', audioSampleRateHz: 48_000, hasFastStart: true,
    ...overrides,
  };
}
