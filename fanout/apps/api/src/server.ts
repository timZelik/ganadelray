import Fastify, { type FastifyBaseLogger, type FastifyInstance, type RawReplyDefaultExpression, type RawRequestDefaultExpression, type RawServerDefault } from 'fastify';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { mountBullBoard } from './bullBoard.ts';
import type { ApiDependencies } from './dependencies.ts';
import { healthRoutes } from './routes/healthRoutes.ts';
import { publishJobRoutes } from './routes/publishJobRoutes.ts';

function bullBoardQueues({ queues }: ApiDependencies) {
  return [queues.watch, queues.ingest, queues.prepare, queues.publish, queues.maintenance].filter((queue) => queue !== undefined);
}

export type ApiServer = FastifyInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, FastifyBaseLogger, ZodTypeProvider>;

/** Builds the HTTP API from injected dependencies; `main.ts` wires real infrastructure, tests wire fakes. */
export async function buildApiServer(dependencies: ApiDependencies): Promise<ApiServer> {
  const loggerInstance: FastifyBaseLogger = dependencies.logger;
  const server = Fastify({ loggerInstance, genReqId: () => crypto.randomUUID() }).withTypeProvider<ZodTypeProvider>();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) return reply.code(400).send({ error: `Invalid request: ${error.message}` });
    request.log.error({ err: error }, 'Unhandled API error');
    return reply.code(500).send({ error: 'Internal server error' });
  });
  await server.register(healthRoutes(dependencies));
  await server.register(publishJobRoutes(dependencies));
  const queues = bullBoardQueues(dependencies);
  if (queues.length > 0) await mountBullBoard(server, queues);
  return server;
}
