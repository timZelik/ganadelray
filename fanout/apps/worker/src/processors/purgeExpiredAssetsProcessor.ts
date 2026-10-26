import { storageKeys } from '@fanout/storage';
import type { WorkerDependencies } from '../dependencies.ts';

const batchSize = 200;

/** Retention: expired renditions are deleted; masters are kept until the user deletes them. Shared files go last. */
export function createPurgeExpiredAssetsProcessor({ repositories, storage, logger, now }: WorkerDependencies) {
  return async function purgeExpiredAssets(): Promise<number> {
    let purgedCount = 0;
    for (let expired = await repositories.assetRepository.listExpired(now(), batchSize); expired.length > 0; expired = await repositories.assetRepository.listExpired(now(), batchSize)) {
      await repositories.assetRepository.markDeleted(expired.map((asset) => asset.id), now());
      const candidateKeys = [...new Set(expired.map((asset) => asset.storageKey))].filter((key) => !storageKeys.isMaster(key));
      for (const storageKey of candidateKeys) {
        if (!(await repositories.assetRepository.isStorageKeyReferenced(storageKey, now()))) await storage.deleteObject(storageKey);
      }
      purgedCount += expired.length;
    }
    if (purgedCount > 0) logger.info({ purgedCount }, 'Purged expired rendered assets');
    return purgedCount;
  };
}
