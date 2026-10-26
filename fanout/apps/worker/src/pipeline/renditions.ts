import { extname, join } from 'node:path';
import type { Asset } from '@fanout/domain';
import { checksumFile, computeRenderFingerprint, mediaProfileOverrideSchema, renderRendition, resolveMediaProfile, type MediaProfile } from '@fanout/media';
import { storageKeys } from '@fanout/storage';
import type { WorkerDependencies } from '../dependencies.ts';
import type { PublishJobContext } from './publishJobContext.ts';
import { withTemporaryWorkspace } from './temporaryWorkspace.ts';

export function profileFor({ publisher, workflow, destination }: PublishJobContext): MediaProfile {
  return resolveMediaProfile(publisher.capabilities, workflow.fitMode, mediaProfileOverrideSchema.parse(destination.mediaProfileOverride));
}

interface RenderedFile {
  storageKey: string;
  checksum: string;
  metadata: Asset['metadata'];
}

/** Encodes (or passes through) the master and stores the result; a conforming master is referenced, never copied. */
async function renderAndStore(dependencies: WorkerDependencies, { sourceItem }: PublishJobContext, profile: MediaProfile, renderFingerprint: string): Promise<RenderedFile> {
  const { storage, settings, logger } = dependencies;
  return withTemporaryWorkspace(settings.mediaWorkDirectory, async (directory) => {
    const masterPath = join(directory, `master${extname(sourceItem.masterStorageKey)}`);
    await storage.downloadToFile(sourceItem.masterStorageKey, masterPath);
    const rendition = await renderRendition({ inputPath: masterPath, outputPath: join(directory, 'rendition.mp4'), profile, sourceMetadata: sourceItem.masterMetadata }, settings.mediaTools);
    logger.info({ sourceItemId: sourceItem.id, passedThrough: rendition.passedThrough, reasons: rendition.reasons }, 'Rendition ready');
    if (rendition.passedThrough) return { storageKey: sourceItem.masterStorageKey, checksum: sourceItem.masterChecksum, metadata: sourceItem.masterMetadata };
    const storageKey = storageKeys.rendition(sourceItem.id, renderFingerprint);
    await storage.uploadFile(storageKey, rendition.outputPath, 'video/mp4');
    return { storageKey, checksum: await checksumFile(rendition.outputPath), metadata: rendition.metadata };
  });
}

/**
 * Ensures this destination has a live asset matching its profile, cheapest path first:
 * its own existing asset → another destination's identical render → a fresh render.
 */
export async function ensureRenditionAsset(dependencies: WorkerDependencies, context: PublishJobContext): Promise<Asset> {
  const { assetRepository } = dependencies.repositories;
  const now = dependencies.now();
  const { sourceItem, destination } = context;
  const profile = profileFor(context);
  const renderFingerprint = computeRenderFingerprint(sourceItem.masterChecksum, profile);
  const ownAsset = await assetRepository.findLiveForDestination(sourceItem.id, destination.id, now);
  if (ownAsset?.renderFingerprint === renderFingerprint) return ownAsset;
  const sharedAsset = await assetRepository.findLiveByFingerprint(sourceItem.id, renderFingerprint, now);
  const renderedFile = sharedAsset ?? (await renderAndStore(dependencies, context, profile, renderFingerprint));
  return assetRepository.upsertForDestination({
    sourceItemId: sourceItem.id,
    workflowDestinationId: destination.id,
    storageKey: renderedFile.storageKey,
    checksum: renderedFile.checksum,
    metadata: renderedFile.metadata,
    renderFingerprint,
    expiresAt: new Date(now.getTime() + dependencies.settings.renderedAssetRetentionMilliseconds),
  });
}
