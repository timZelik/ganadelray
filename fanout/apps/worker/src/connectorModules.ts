import { bufferConnectorModule } from '@fanout/connector-buffer';
import { consoleConnectorModule } from '@fanout/connector-console';
import { createLocalFolderConnectorModule } from '@fanout/connector-local-folder';
import { createUploadConnectorModule } from '@fanout/connector-upload';
import type { ConnectorModule } from '@fanout/connectors-core';
import type { ObjectStorage } from '@fanout/storage';

export interface ConnectorModuleSettings {
  hubSettleMilliseconds: number;
  storage: ObjectStorage;
}

/** Adding a platform = adding its package and one line here. Nothing else switches on platform. */
export function installedConnectorModules({ hubSettleMilliseconds, storage }: ConnectorModuleSettings): ConnectorModule[] {
  return [
    consoleConnectorModule,
    bufferConnectorModule,
    createUploadConnectorModule(storage),
    createLocalFolderConnectorModule({ settleMilliseconds: hubSettleMilliseconds }),
  ];
}
