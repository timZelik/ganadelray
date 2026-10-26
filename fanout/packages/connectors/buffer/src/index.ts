import type { ConnectorModule } from '@fanout/connectors-core';
import { createBufferPublisher } from './bufferPublisher.ts';
import { bufferSupportedDestinations } from './bufferServices.ts';

export * from './bufferClient.ts';
export * from './bufferPublisher.ts';
export * from './bufferServices.ts';
export type { BufferChannel } from './bufferOperations.ts';

export const bufferConnectorModule: ConnectorModule = {
  name: 'buffer',
  publishers: bufferSupportedDestinations.map(createBufferPublisher),
};
