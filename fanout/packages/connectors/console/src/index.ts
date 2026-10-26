import type { ConnectorModule } from '@fanout/connectors-core';
import { destinationKinds } from '@fanout/domain';
import { createConsolePublisher } from './consolePublisher.ts';

export * from './consolePublisher.ts';

export const consoleConnectorModule: ConnectorModule = {
  name: 'console',
  publishers: destinationKinds.map(createConsolePublisher),
};
