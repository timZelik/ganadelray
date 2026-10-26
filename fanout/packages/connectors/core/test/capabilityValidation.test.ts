import { destinationCapabilities, type MediaMetadata } from '@fanout/domain';
import { describe, expect, it } from 'vitest';
import { countHashtags } from '@fanout/domain';
import { validateAgainstCapabilities, type PreparedAsset } from '../src/index.ts';

const metadata: MediaMetadata = {
  formatName: 'mov,mp4,m4a,3gp,3g2,mj2', majorBrand: 'isom', durationSeconds: 30, sizeBytes: 10_000_000, width: 1080, height: 1920, rotationDegrees: 0, frameRate: 30,
  videoCodec: 'h264', videoProfile: 'High', pixelFormat: 'yuv420p', audioCodec: 'aac', audioSampleRateHz: 48_000, hasFastStart: true,
};

function asset(overrides: Partial<MediaMetadata> = {}, publicUrl: string | null = 'https://cdn.test/a.mp4'): PreparedAsset {
  return { assetId: 'asset-1', storageKey: 'k', metadata: { ...metadata, ...overrides }, publicUrl, openReadStream: async () => new ReadableStream() };
}

describe('validateAgainstCapabilities', () => {
  it('accepts a post within every limit', () => {
    expect(validateAgainstCapabilities(destinationCapabilities.instagram_reels, asset(), { caption: 'hi #one', title: null, hashtags: [] })).toEqual({ valid: true, problems: [] });
  });

  it('lists every violated limit at once', () => {
    const tooManyHashtags = Array.from({ length: 31 }, (_, index) => `#tag${index}`).join(' ');
    const result = validateAgainstCapabilities(destinationCapabilities.instagram_reels, asset({ durationSeconds: 2 }, null), { caption: tooManyHashtags, title: null, hashtags: [] });
    expect(result.valid).toBe(false);
    expect(result.problems).toEqual([
      'Video is 2s; minimum is 3s',
      'Caption has 31 hashtags; limit is 30',
      'Platform pulls media from a public URL but none was provided',
    ]);
  });

  it('enforces title limits where the platform has titles', () => {
    const result = validateAgainstCapabilities(destinationCapabilities.youtube_shorts, asset(), { caption: '', title: 'x'.repeat(101), hashtags: [] });
    expect(result.problems).toEqual(['Title is 101 characters; limit is 100']);
  });
});

describe('countHashtags', () => {
  it('counts unicode hashtags but not URL fragments', () => {
    expect(countHashtags('#café #日本 https://site.test/#anchor word#notatag')).toBe(2);
  });
});
