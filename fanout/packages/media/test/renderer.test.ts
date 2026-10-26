import { join } from 'node:path';
import { destinationCapabilities } from '@fanout/domain';
import { createTemporaryDirectory, createTestVideo } from '@fanout/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { findProfileViolations, probeMedia, renderRendition, resolveMediaProfile } from '../src/index.ts';

const tools = { ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' };
const profile = resolveMediaProfile(destinationCapabilities.tiktok, 'pad');
let directory: string;

beforeAll(async () => {
  directory = await createTemporaryDirectory();
});

describe('renderRendition', () => {
  it('normalizes a landscape, 44.1kHz, non-faststart master into a conforming vertical MP4', { timeout: 60_000 }, async () => {
    const inputPath = await createTestVideo(directory, { width: 640, height: 360, durationSeconds: 1, fileName: 'landscape.mp4' });
    const sourceMetadata = await probeMedia(inputPath);
    const rendition = await renderRendition({ inputPath, outputPath: join(directory, 'tiktok.mp4'), profile, sourceMetadata }, tools);
    expect(rendition.passedThrough).toBe(false);
    expect(rendition.reasons.length).toBeGreaterThan(0);
    expect(findProfileViolations(rendition.metadata, profile)).toEqual([]);
  });

  it('adds a silent track to a video-only master', { timeout: 60_000 }, async () => {
    const inputPath = await createTestVideo(directory, { withAudio: false, durationSeconds: 1, fileName: 'video-only.mp4' });
    const rendition = await renderRendition({ inputPath, outputPath: join(directory, 'with-audio.mp4'), profile, sourceMetadata: await probeMedia(inputPath) }, tools);
    expect(rendition.metadata).toMatchObject({ audioCodec: 'aac', audioSampleRateHz: 48_000 });
  });

  it('skips re-encoding when the master already satisfies the profile', { timeout: 60_000 }, async () => {
    const inputPath = await createTestVideo(directory, {
      width: 1080, height: 1920, durationSeconds: 1, fileName: 'conforming.mp4',
      extraOutputArguments: ['-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-ar', '48000', '-movflags', '+faststart'],
    });
    const rendition = await renderRendition({ inputPath, outputPath: join(directory, 'unused.mp4'), profile, sourceMetadata: await probeMedia(inputPath) }, tools);
    expect(rendition).toMatchObject({ passedThrough: true, outputPath: inputPath, reasons: [] });
  });
});
