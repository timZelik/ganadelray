import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import type { ObjectStorage, UploadBody } from './objectStorage.ts';

export interface InMemoryObjectStorage extends ObjectStorage {
  readonly objects: Map<string, { body: Buffer; contentType: string }>;
}

async function readUploadBody(body: UploadBody): Promise<Buffer> {
  if (body instanceof Uint8Array) return Buffer.from(body);
  return buffer(body instanceof ReadableStream ? Readable.fromWeb(body as import('node:stream/web').ReadableStream) : body);
}

/** Test double with the same contract as S3; presigned URLs are fake but stable. */
export function createInMemoryObjectStorage(): InMemoryObjectStorage {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  function requireObject(key: string) {
    const stored = objects.get(key);
    if (!stored) throw new Error(`NoSuchKey: ${key}`);
    return stored;
  }
  const upload = async (key: string, body: UploadBody, contentType: string) => void objects.set(key, { body: await readUploadBody(body), contentType });
  return {
    objects,
    ensureBucket: async () => undefined,
    upload,
    uploadFile: async (key, filePath, contentType) => upload(key, createReadStream(filePath), contentType),
    downloadToFile: async (key, filePath) => writeFile(filePath, requireObject(key).body),
    openReadStream: async (key) => Readable.toWeb(Readable.from(requireObject(key).body)) as ReadableStream<Uint8Array>,
    objectExists: async (key) => objects.has(key),
    deleteObject: async (key) => void objects.delete(key),
    createPresignedGetUrl: async (key, expiresInSeconds) => `https://storage.invalid/${encodeURI(key)}?expires=${expiresInSeconds}`,
  };
}

