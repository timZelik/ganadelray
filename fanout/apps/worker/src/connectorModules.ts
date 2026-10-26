import { consoleConnectorModule } from '@fanout/connector-console';
import { createLocalFolderConnectorModule } from '@fanout/connector-local-folder';
import type { ConnectorModule } from '@fanout/connectors-core';

export interface ConnectorModuleSettings {
  hubSettleMilliseconds: number;
}

/** Adding a platform = adding its package and one line here. Nothing else switches on platform. */
export function installedConnectorModules({ hubSettleMilliseconds }: ConnectorModuleSettings): ConnectorModule[] {
  return [consoleConnectorModule, createLocalFolderConnectorModule({ settleMilliseconds: hubSettleMilliseconds })];
}
