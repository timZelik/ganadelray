import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PermanentError } from '@fanout/domain';
import { createTemporaryDirectory, createTestVideo } from '@fanout/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { detectFastStart, parseFrameRate, probeMedia, runProcess } from '../src/index.ts';

let directory: string;
beforeAll(async () => {
  directory = await createTemporaryDirectory();
});

describe('probeMedia', () => {
  it('normalizes ffprobe output for an ordinary file', async () => {
    const videoPath = await createTestVideo(directory, { width: 640, height: 360, durationSeconds: 2, fileName: 'plain.mp4' });
    const metadata = await probeMedia(videoPath);
    expect(metadata).toMatchObject({ width: 640, height: 360, rotationDegrees: 0, frameRate: 30, videoCodec: 'h264', audioCodec: 'aac', audioSampleRateHz: 44_100, majorBrand: 'isom', hasFastStart: false });
    expect(metadata.durationSeconds).toBeCloseTo(2, 0);
    expect(metadata.sizeBytes).toBeGreaterThan(0);
  });

  it('reports display dimensions for phone video stored sideways with rotation metadata', async () => {
    const sidewaysPath = await createTestVideo(directory, { width: 640, height: 360, fileName: 'sideways.mp4' });
    const rotatedPath = join(directory, 'rotated.mp4');
    await runProcess('ffmpeg', ['-v', 'error', '-y', '-display_rotation', '90', '-i', sidewaysPath, '-c', 'copy', rotatedPath], { timeoutMilliseconds: 30_000 });
    expect(await probeMedia(rotatedPath)).toMatchObject({ width: 360, height: 640, rotationDegrees: 90 });
  });

  it('detects missing audio and +faststart', async () => {
    const videoPath = await createTestVideo(directory, { withAudio: false, extraOutputArguments: ['-c:v', 'libx264', '-movflags', '+faststart'], fileName: 'silent.mp4' });
    expect(await probeMedia(videoPath)).toMatchObject({ audioCodec: null, audioSampleRateHz: null, hasFastStart: true });
    expect(await detectFastStart(videoPath)).toBe(true);
  });

  it('rejects corrupt files with a PermanentError', async () => {
    const corruptPath = join(directory, 'corrupt.mp4');
    await writeFile(corruptPath, 'this is not a video');
    await expect(probeMedia(corruptPath)).rejects.toBeInstanceOf(PermanentError);
  });
});

describe('parseFrameRate', () => {
  it('parses NTSC rationals and guards against zero denominators', () => {
    expect(parseFrameRate('30000/1001')).toBe(29.97);
    expect(parseFrameRate('0/0')).toBe(0);
    expect(parseFrameRate(undefined)).toBe(0);
  });
});
