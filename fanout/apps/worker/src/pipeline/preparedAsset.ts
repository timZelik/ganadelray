import type { PreparedAsset } from '@fanout/connectors-core';
import type { Asset } from '@fanout/domain';
import type { ObjectStorage } from '@fanout/storage';

/** Presigns only for platforms that pull media; the URL lives long enough for asynchronous processing (24h default). */
export async function toPreparedAsset(asset: Asset, storage: ObjectStorage, needsPublicUrl: boolean, presignedUrlTtlSeconds: number): Promise<PreparedAsset> {
  return {
    assetId: asset.id,
    storageKey: asset.storageKey,
    metadata: asset.metadata,
    publicUrl: needsPublicUrl ? await storage.createPresignedGetUrl(asset.storageKey, presignedUrlTtlSeconds) : null,
    openReadStream: () => storage.openReadStream(asset.storageKey),
  };
}
