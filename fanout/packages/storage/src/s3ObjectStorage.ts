import { createReadStream, createWriteStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorage, UploadBody } from './objectStorage.ts';
import { toNodeReadable } from './streams.ts';

export interface S3StorageSettings {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Omit for AWS; set for MinIO, SeaweedFS or Cloudflare R2. */
  endpoint?: string;
  /** Host platforms use to fetch presigned URLs, when it differs from the internal endpoint (e.g. Docker networking). */
  publicEndpoint?: string;
  forcePathStyle: boolean;
}

const maximumPresignSeconds = 7 * 24 * 60 * 60;

function buildClient(settings: S3StorageSettings, endpoint: string | undefined): S3Client {
  const config: S3ClientConfig = {
    region: settings.region,
    forcePathStyle: settings.forcePathStyle,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    // R2 and older S3-compatible servers reject the newer default checksum headers.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(endpoint ? { endpoint } : {}),
  };
  return new S3Client(config);
}

function isNotFound(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return status === 404 || (error as { name?: string }).name === 'NotFound' || (error as { name?: string }).name === 'NoSuchKey';
}

function toUploadBody(body: UploadBody): Readable | Uint8Array {
  return body instanceof ReadableStream ? toNodeReadable(body) : body;
}

export function createS3ObjectStorage(settings: S3StorageSettings): ObjectStorage {
  const client = buildClient(settings, settings.endpoint);
  const presigningClient = settings.publicEndpoint ? buildClient(settings, settings.publicEndpoint) : client;
  const Bucket = settings.bucket;

  async function getBody(key: string) {
    const { Body } = await client.send(new GetObjectCommand({ Bucket, Key: key }));
    if (!Body) throw new Error(`Object ${key} has no body`);
    return Body;
  }

  async function upload(key: string, body: UploadBody, contentType: string): Promise<void> {
    await new Upload({ client, params: { Bucket, Key: key, Body: toUploadBody(body), ContentType: contentType } }).done();
  }

  return {
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
      } catch (error) {
        if (!isNotFound(error)) throw error;
        await client.send(new CreateBucketCommand({ Bucket }));
      }
    },
    upload,
    uploadFile: (key, filePath, contentType) => upload(key, createReadStream(filePath), contentType),
    async downloadToFile(key, filePath) {
      const body = await getBody(key);
      await pipeline(body.transformToWebStream() as unknown as NodeJS.ReadableStream, createWriteStream(filePath));
    },
    openReadStream: async (key) => (await getBody(key)).transformToWebStream() as ReadableStream<Uint8Array>,
    async objectExists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    createPresignedGetUrl: (key, expiresInSeconds) =>
      getSignedUrl(presigningClient, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: Math.min(expiresInSeconds, maximumPresignSeconds) }),
  };
}
