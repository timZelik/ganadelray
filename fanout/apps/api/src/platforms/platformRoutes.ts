import { apiRoutePatterns, apiRoutes, connectBufferRequestSchema, destinationParametersSchema, errorResponseSchema, platformsResponseSchema, updateDestinationRequestSchema, updateFitModeRequestSchema } from '@fanout/api-contract';
import { PipelineError } from '@fanout/domain';
import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { ApiDependencies } from '../dependencies.ts';
import { toFriendlyProblem } from '../friendlyProblems.ts';
import { connectBuffer, disconnectBuffer, readPlatformSettings, updateDestinationSettings, updateFitMode } from './platformSettings.ts';

const responses = { 200: platformsResponseSchema, 400: errorResponseSchema };

/** Known problems (bad key, invalid template) become a 400 with a readable message; anything else is a real error. */
async function answer<Result>(reply: FastifyReply, work: () => Promise<Result>): Promise<Result | { error: string }> {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof PipelineError)) throw error;
    const message = error.kind === 'reauth_required' ? 'Buffer did not accept that API key. Copy it again from Buffer → Settings → API.' : toFriendlyProblem(error.message);
    reply.code(400);
    return { error: message ?? 'That did not work' };
  }
}

export function platformRoutes(dependencies: ApiDependencies): FastifyPluginAsyncZod {
  return async (server) => {
    server.get(apiRoutes.platforms, { schema: { response: { 200: platformsResponseSchema } } }, () => readPlatformSettings(dependencies));
    server.put(apiRoutes.bufferConnection, { schema: { body: connectBufferRequestSchema, response: responses } }, (request, reply) => answer(reply, () => connectBuffer(dependencies, request.body.apiKey)));
    server.delete(apiRoutes.bufferConnection, { schema: { response: responses } }, () => disconnectBuffer(dependencies));
    server.patch(apiRoutePatterns.destination, { schema: { params: destinationParametersSchema, body: updateDestinationRequestSchema, response: responses } }, (request, reply) =>
      answer(reply, () => updateDestinationSettings(dependencies, request.params.destinationId, request.body)));
    server.put(apiRoutes.fitMode, { schema: { body: updateFitModeRequestSchema, response: responses } }, (request) => updateFitMode(dependencies, request.body.fitMode));
  };
}
