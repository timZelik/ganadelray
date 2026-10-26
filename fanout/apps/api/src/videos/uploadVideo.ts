import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { Readable } from 'node:stream';
import { uploadAccountHandle } from '@fanout/database';
import { storageKeys } from '@fanout/storage';
import type { ApiDependencies } from '../dependencies.ts';

export const acceptedVideoExtensions = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);

export interface IncomingUpload {
  fileName: string;
  contentType: string;
  stream: Readable & { truncated?: boolean };
  caption: string | null;
  title: string | null;
}

export type UploadResult = { result: 'accepted'; uploadId: string } | { result: 'rejected'; statusCode: 400 | 413; problem: string };

function titleFromFileName(fileName: string): string {
  return fileName.slice(0, fileName.length - extname(fileName).length).replace(/[-_]+/g, ' ').trim() || 'Untitled video';
}

export async function findUploadConnectionId({ connectionRepository }: ApiDependencies): Promise<string> {
  const connection = await connectionRepository.findByPlatformAndHandle('upload', uploadAccountHandle);
  if (!connection) throw new Error('The upload source is missing; run the migrate step to seed it');
  return connection.id;
}

/** Streams the browser upload into storage (never into memory), then hands it to the same ingest pipeline as every other source. */
export async function uploadVideo(dependencies: ApiDependencies, upload: IncomingUpload): Promise<UploadResult> {
  const extension = extname(upload.fileName).toLowerCase();
  if (!acceptedVideoExtensions.has(extension)) {
    upload.stream.resume();
    return { result: 'rejected', statusCode: 400, problem: 'Please upload a video file (MP4, MOV, M4V, WebM or MKV).' };
  }
  const uploadId = randomUUID();
  const storageKey = storageKeys.upload(uploadId, extension);
  await dependencies.storage.upload(storageKey, upload.stream, upload.contentType || 'video/mp4');
  if (upload.stream.truncated) {
    await dependencies.storage.deleteObject(storageKey);
    return { result: 'rejected', statusCode: 413, problem: `That video is larger than ${Math.round(dependencies.maximumUploadBytes / 1_048_576)} MB.` };
  }
  await dependencies.queues.enqueueIngest({
    connectionId: await findUploadConnectionId(dependencies),
    candidate: {
      externalId: uploadId,
      title: upload.title?.trim() || titleFromFileName(upload.fileName),
      originalCaption: upload.caption?.trim() || null,
      detectedAt: dependencies.now().toISOString(),
      locator: { storageKey, fileName: upload.fileName },
    },
  });
  return { result: 'accepted', uploadId };
}
