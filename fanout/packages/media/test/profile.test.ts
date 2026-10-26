import { destinationCapabilities } from '@fanout/domain';
import { buildMediaMetadata } from '@fanout/testing';
import { describe, expect, it } from 'vitest';
import { assertUsableMaster, buildRenderArguments, chooseOutputFrameRate, computeRenderFingerprint, findProfileViolations, mediaProfileOverrideSchema, resolveMediaProfile } from '../src/index.ts';

const reelsProfile = resolveMediaProfile(destinationCapabilities.instagram_reels, 'pad');

const conformingMetadata = buildMediaMetadata({ durationSeconds: 20, sizeBytes: 5_000_000 });

describe('resolveMediaProfile', () => {
  it('derives a vertical 1080×1920 H.264 High / AAC 48kHz target from capabilities', () => {
    expect(reelsProfile).toMatchObject({ width: 1080, height: 1920, videoProfile: 'High', audioSampleRateHz: 48_000, fitMode: 'pad', maximumFrameRate: 30, maximumFileSizeBytes: destinationCapabilities.instagram_reels.maximumFileSizeBytes });
  });

  it('applies overrides but never exceeds the platform frame-rate ceiling', () => {
    expect(resolveMediaProfile(destinationCapabilities.tiktok, 'crop', { maximumFrameRate: 120, constantRateFactor: 18 })).toMatchObject({ maximumFrameRate: 60, constantRateFactor: 18, fitMode: 'crop' });
  });

  it('rejects unknown override keys at the boundary', () => {
    expect(mediaProfileOverrideSchema.safeParse({ width: 720 }).success).toBe(false);
  });
});

describe('computeRenderFingerprint', () => {
  it('is equal for identical profiles regardless of key order, and differs when a parameter changes', () => {
    const reordered = Object.fromEntries(Object.entries(reelsProfile).reverse()) as typeof reelsProfile;
    expect(computeRenderFingerprint('master', reordered)).toBe(computeRenderFingerprint('master', reelsProfile));
    expect(computeRenderFingerprint('master', { ...reelsProfile, fitMode: 'crop' })).not.toBe(computeRenderFingerprint('master', reelsProfile));
    expect(computeRenderFingerprint('other-master', reelsProfile)).not.toBe(computeRenderFingerprint('master', reelsProfile));
  });
});

describe('findProfileViolations', () => {
  it('finds nothing for a conforming master, so re-encoding is skipped', () => {
    expect(findProfileViolations(conformingMetadata, reelsProfile)).toEqual([]);
  });

  it('lists every reason a master needs re-encoding', () => {
    const violations = findProfileViolations({ ...conformingMetadata, majorBrand: 'qt', width: 1920, height: 1080, audioCodec: null, audioSampleRateHz: null, hasFastStart: false, rotationDegrees: 90 }, reelsProfile);
    expect(violations).toEqual([
      'container is qt, not MP4',
      'frame is 1920×1080, not 1080×1920',
      'has 90° rotation metadata',
      'audio codec is missing, not aac',
      'audio sample rate is missing, not 48000',
      'moov atom is not at the front (+faststart)',
    ]);
  });
});

describe('buildRenderArguments', () => {
  const plan = { inputPath: '/in.mov', outputPath: '/out.mp4', profile: reelsProfile, sourceMetadata: { ...conformingMetadata, frameRate: 60 } };

  it('pads, clamps frame rate, uses closed fixed GOPs, strips metadata and sets +faststart', () => {
    const ffmpegArguments = buildRenderArguments(plan);
    const videoFilter = ffmpegArguments[ffmpegArguments.indexOf('-vf') + 1];
    expect(videoFilter).toContain('force_original_aspect_ratio=decrease');
    expect(videoFilter).toContain('pad=1080:1920');
    expect(videoFilter).toContain('fps=30');
    expect(ffmpegArguments.join(' ')).toContain('-profile:v high');
    expect(ffmpegArguments.join(' ')).toContain('-g 60 -keyint_min 60 -sc_threshold 0 -flags +cgop');
    expect(ffmpegArguments.join(' ')).toContain('-ar 48000');
    expect(ffmpegArguments.join(' ')).toContain('-map_metadata -1');
    expect(ffmpegArguments.join(' ')).toContain('-movflags +faststart');
    expect(ffmpegArguments.at(-1)).toBe('/out.mp4');
  });

  it('crops instead of padding when the workflow asks for it', () => {
    const ffmpegArguments = buildRenderArguments({ ...plan, profile: { ...reelsProfile, fitMode: 'crop' } });
    expect(ffmpegArguments[ffmpegArguments.indexOf('-vf') + 1]).toContain('crop=1080:1920');
  });

  it('adds a silent audio track when the master has none', () => {
    const ffmpegArguments = buildRenderArguments({ ...plan, sourceMetadata: { ...conformingMetadata, audioCodec: null } });
    expect(ffmpegArguments.join(' ')).toContain('anullsrc=channel_layout=stereo:sample_rate=48000');
    expect(ffmpegArguments.join(' ')).toContain('-map 1:a:0 -shortest');
  });
});

describe('chooseOutputFrameRate', () => {
  it('keeps in-range rates and lifts too-slow footage to 30', () => {
    expect(chooseOutputFrameRate(24, reelsProfile)).toBe(24);
    expect(chooseOutputFrameRate(15, reelsProfile)).toBe(30);
  });
});

describe('assertUsableMaster', () => {
  it('rejects zero-length and too-short masters', () => {
    expect(() => assertUsableMaster({ ...conformingMetadata, durationSeconds: 0 }, 1)).toThrow(/no measurable duration/);
    expect(() => assertUsableMaster({ ...conformingMetadata, durationSeconds: 0.5 }, 1)).toThrow(/minimum is 1s/);
    expect(() => assertUsableMaster(conformingMetadata, 1)).not.toThrow();
  });
});
