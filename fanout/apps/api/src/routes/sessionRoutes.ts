import { apiRoutes, sessionResponseSchema } from '@fanout/api-contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/** Who is logged in; the onRequest guard has already rejected anonymous callers. */
export function sessionRoutes(): FastifyPluginAsyncZod {
  return async (server) => {
    server.get(apiRoutes.session, { schema: { response: { 200: sessionResponseSchema } } }, async (request) => ({ user: { name: request.sessionUser!.name, email: request.sessionUser!.email } }));
  };
}
