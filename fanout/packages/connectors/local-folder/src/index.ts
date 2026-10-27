import type { ConnectorModule } from '@fanout/connectors-core';
import { createLocalFolderWatcher, type LocalFolderWatcherOptions } from './localFolderWatcher.ts';

export * from './localFolderWatcher.ts';
export * from './settings.ts';
export { externalIdFor, videoExtensions } from './folderScan.ts';

export function createLocalFolderConnectorModule(options: LocalFolderWatcherOptions = {}): ConnectorModule {
  return { name: 'local-folder', sourceWatchers: [createLocalFolderWatcher(options)] };
}
