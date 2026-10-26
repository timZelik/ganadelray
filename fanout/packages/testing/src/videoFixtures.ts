import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TestVideoOptions {
  width?: number;
  height?: number;
  durationSeconds?: number;
  frameRate?: number;
  withAudio?: boolean;
  /** Extra ffmpeg output arguments, e.g. ['-movflags', '+faststart'] or a different codec. */
  extraOutputArguments?: string[];
  fileName?: string;
}

function runFfmpeg(ffmpegArguments: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ffmpegArguments, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('close', (exitCode) => (exitCode === 0 ? resolve() : reject(new Error(`ffmpeg fixture failed: ${stderr}`))));
  });
}

export async function createTemporaryDirectory(prefix = 'fanout-test-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/** Synthesizes a small test-pattern video with ffmpeg's lavfi sources, so no binary fixtures live in git. */
export async function createTestVideo(directory: string, options: TestVideoOptions = {}): Promise<string> {
  const { width = 640, height = 360, durationSeconds = 2, frameRate = 30, withAudio = true, extraOutputArguments = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'], fileName = 'master.mp4' } = options;
  const outputPath = join(directory, fileName);
  const videoInput = ['-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=${frameRate}:duration=${durationSeconds}`];
  const audioInput = withAudio ? ['-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=44100:duration=${durationSeconds}`] : [];
  await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', ...videoInput, ...audioInput, ...extraOutputArguments, ...(withAudio ? ['-c:a', 'aac'] : []), '-shortest', outputPath]);
  return outputPath;
}
