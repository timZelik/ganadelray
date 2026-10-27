import { apiRoutes, healthResponseSchema } from '@fanout/api-contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { ApiDependencies } from '../dependencies.ts';

export function healthRoutes({ dryRun }: ApiDependencies): FastifyPluginAsyncZod {
  return async (server) => {
    server.get(apiRoutes.health, { schema: { response: { 200: healthResponseSchema } } }, async () => ({ status: 'ok' as const, dryRun }));
  };
}
