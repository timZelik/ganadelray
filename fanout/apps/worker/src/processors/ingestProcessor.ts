import { createWriteStream } from 'node:fs';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { SourceItemCandidate } from '@fanout/connectors-core';
import { PermanentError, type MediaMetadata, type SourceItem, type SourceKind } from '@fanout/domain';
import { assertUsableMaster, checksumFile, extractThumbnail, probeMedia } from '@fanout/media';
import { ingestJobSchema } from '@fanout/queue';
import { storageKeys, toNodeReadable } from '@fanout/storage';
import type { Job } from 'bullmq';
import type { WorkerDependencies } from '../dependencies.ts';
import { fanOutSourceItem } from '../pipeline/fanOut.ts';
import { withTemporaryWorkspace } from '../pipeline/temporaryWorkspace.ts';

const contentTypesByExtension: Record<string, string> = { '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska' };

function masterExtensionOf(candidate: SourceItemCandidate): string {
  return extname(candidate.locator.relativePath ?? candidate.locator.fileName ?? '').toLowerCase() || '.mp4';
}

/** A thumbnail is a nicety: failing to make one never fails the ingest. */
async function storeThumbnail({ storage, settings, logger }: WorkerDependencies, masterPath: string, thumbnailPath: string, metadata: MediaMetadata, masterChecksum: string): Promise<string | null> {
  try {
    await extractThumbnail(masterPath, thumbnailPath, metadata, settings.mediaTools.ffmpegPath);
    const thumbnailStorageKey = storageKeys.thumbnail(masterChecksum);
    await storage.uploadFile(thumbnailStorageKey, thumbnailPath, 'image/jpeg');
    return thumbnailStorageKey;
  } catch (error) {
    logger.warn({ err: error }, 'Thumbnail could not be created');
    return null;
  }
}

async function storeMaster(dependencies: WorkerDependencies, connectionId: string, candidate: SourceItemCandidate, mediaStream: ReadableStream<Uint8Array>): Promise<SourceItem> {
  const { storage, settings, repositories } = dependencies;
  const extension = masterExtensionOf(candidate);
  return withTemporaryWorkspace(settings.mediaWorkDirectory, async (directory) => {
    const masterPath = join(directory, `master${extension}`);
    await pipeline(toNodeReadable(mediaStream), createWriteStream(masterPath));
    const masterMetadata = await probeMedia(masterPath, settings.mediaTools.ffprobePath);
    assertUsableMaster(masterMetadata, settings.minimumSourceDurationSeconds);
    const masterChecksum = await checksumFile(masterPath);
    const masterStorageKey = storageKeys.master(connectionId, masterChecksum, extension);
    if (!(await storage.objectExists(masterStorageKey))) await storage.uploadFile(masterStorageKey, masterPath, contentTypesByExtension[extension] ?? 'video/mp4');
    const thumbnailStorageKey = await storeThumbnail(dependencies, masterPath, join(directory, 'thumbnail.jpg'), masterMetadata, masterChecksum);
    const { sourceItem } = await repositories.sourceItemRepository.insertIfAbsent({
      sourceConnectionId: connectionId, externalId: candidate.externalId, detectedAt: candidate.detectedAt, title: candidate.title,
      originalCaption: candidate.originalCaption, durationSeconds: masterMetadata.durationSeconds, masterStorageKey, masterChecksum, masterMetadata, thumbnailStorageKey,
    });
    return sourceItem;
  });
}

/** Fetches a detected item's master, validates it with ffprobe, stores it once, then fans out to every workflow. */
export function createIngestProcessor(dependencies: WorkerDependencies) {
  const { repositories, registry, logger } = dependencies;
  return async function processIngestJob(job: Job): Promise<string | null> {
    const { connectionId, candidate: payload } = ingestJobSchema.parse(job.data);
    const candidate: SourceItemCandidate = { ...payload, detectedAt: new Date(payload.detectedAt) };
    const alreadyIngested = await repositories.sourceItemRepository.findByExternalId(connectionId, candidate.externalId);
    if (alreadyIngested) {
      await fanOutSourceItem(dependencies, alreadyIngested);
      return alreadyIngested.id;
    }
    const connection = await repositories.connectionRepository.findById(connectionId);
    if (!connection) throw new PermanentError(`Connection ${connectionId} no longer exists`);
    const watcher = registry.getSourceWatcher(connection.platform as SourceKind);
    const mediaStream = await watcher.fetchMediaFile(connection, candidate);
    if (!mediaStream) {
      logger.info({ connectionId, externalId: candidate.externalId }, 'Source exposes metadata only; waiting for the hub master');
      return null;
    }
    const sourceItem = await storeMaster(dependencies, connectionId, candidate, mediaStream);
    await watcher.onIngested?.(connection, candidate);
    const queuedCount = await fanOutSourceItem(dependencies, sourceItem);
    logger.info({ sourceItemId: sourceItem.id, title: sourceItem.title, queuedCount }, 'Ingested source item');
    return sourceItem.id;
  };
}
