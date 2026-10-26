import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** Media work happens in a scratch directory that is always removed, even when ffmpeg fails. */
export async function withTemporaryWorkspace<Result>(baseDirectory: string, work: (directory: string) => Promise<Result>): Promise<Result> {
  await mkdir(baseDirectory, { recursive: true });
  const directory = await mkdtemp(join(baseDirectory, 'job-'));
  try {
    return await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
