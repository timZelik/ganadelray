import { setupServer, type SetupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

/** Starts an MSW server for the current test file; unhandled requests fail loudly so no test reaches a real platform. */
export function useMockServer(): SetupServer {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}
