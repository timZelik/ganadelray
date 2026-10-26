import type { Readable } from 'node:stream';

export type UploadBody = Readable | ReadableStream<Uint8Array> | Uint8Array;

export interface ObjectStorage {
  ensureBucket(): Promise<void>;
  uploadFile(key: string, filePath: string, contentType: string): Promise<void>;
  upload(key: string, body: UploadBody, contentType: string): Promise<void>;
  downloadToFile(key: string, filePath: string): Promise<void>;
  openReadStream(key: string): Promise<ReadableStream<Uint8Array>>;
  objectExists(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
  /** A time-limited public GET URL, for platforms that pull media themselves. */
  createPresignedGetUrl(key: string, expiresInSeconds: number): Promise<string>;
}
