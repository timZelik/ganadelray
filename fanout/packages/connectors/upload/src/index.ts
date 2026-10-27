import type { ConnectorModule, SourceWatcher } from '@fanout/connectors-core';
import { PermanentError } from '@fanout/domain';
import type { ObjectStorage } from '@fanout/storage';

export const uploadStoragePrefix = 'uploads/';

/** Browser uploads are pushed by the API, so there is nothing to poll; the watcher only reads the stored file back. */
export function createUploadWatcher(storage: ObjectStorage): SourceWatcher {
  const storageKeyOf = (locator: Record<string, string>) => {
    const storageKey = locator.storageKey;
    if (!storageKey?.startsWith(uploadStoragePrefix)) throw new PermanentError('Upload has no stored file');
    return storageKey;
  };
  return {
    sourceKind: 'upload',
    listNewItemsSince: async (_connection, cursor) => ({ items: [], nextCursor: cursor }),
    fetchMediaFile: async (_connection, item) => storage.openReadStream(storageKeyOf(item.locator)),
    onIngested: async (_connection, item) => storage.deleteObject(storageKeyOf(item.locator)),
  };
}

export function createUploadConnectorModule(storage: ObjectStorage): ConnectorModule {
  return { name: 'upload', sourceWatchers: [createUploadWatcher(storage)] };
}
