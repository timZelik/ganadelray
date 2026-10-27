import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTemporaryDirectory, startS3Container, type StartedS3 } from '@fanout/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createS3ObjectStorage, type ObjectStorage } from '../src/index.ts';

let s3: StartedS3;
let storage: ObjectStorage;

beforeAll(async () => {
  s3 = await startS3Container();
  storage = createS3ObjectStorage({ bucket: 'fanout-test', region: 'us-east-1', accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey, endpoint: s3.endpoint, forcePathStyle: true });
  await storage.ensureBucket();
});

afterAll(async () => {
  await s3?.container.stop();
});

describe('S3 object storage', () => {
  it('round-trips a file and reports existence', async () => {
    const directory = await createTemporaryDirectory();
    const sourcePath = join(directory, 'source.bin');
    await writeFile(sourcePath, Buffer.alloc(256 * 1024, 7));
    await storage.uploadFile('renditions/item/fingerprint.mp4', sourcePath, 'video/mp4');
    expect(await storage.objectExists('renditions/item/fingerprint.mp4')).toBe(true);
    const downloadedPath = join(directory, 'downloaded.bin');
    await storage.downloadToFile('renditions/item/fingerprint.mp4', downloadedPath);
    expect(await readFile(downloadedPath)).toEqual(await readFile(sourcePath));
  });

  it('serves presigned GET URLs that work without credentials', async () => {
    await storage.upload('public/clip.txt', new TextEncoder().encode('pull me'), 'text/plain');
    const response = await fetch(await storage.createPresignedGetUrl('public/clip.txt', 24 * 60 * 60));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('pull me');
  });

  it('deletes objects and treats missing ones as absent', async () => {
    await storage.upload('temporary.txt', new TextEncoder().encode('x'), 'text/plain');
    await storage.deleteObject('temporary.txt');
    expect(await storage.objectExists('temporary.txt')).toBe(false);
  });
});
