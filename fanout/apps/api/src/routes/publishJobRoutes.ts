import { apiRoutePatterns, apiRoutes, errorResponseSchema, listPublishJobsQuerySchema, listPublishJobsResponseSchema, publishJobParametersSchema, publishJobViewSchema, retryPublishJobResponseSchema } from '@fanout/api-contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { ApiDependencies } from '../dependencies.ts';
import { presentPublishJob } from '../publishJobPresenter.ts';
import { retryPublishJob } from '../retryPublishJob.ts';

export function publishJobRoutes(dependencies: ApiDependencies): FastifyPluginAsyncZod {
  const { publishJobRepository } = dependencies;
  return async (server) => {
    server.get(apiRoutes.publishJobs, { schema: { querystring: listPublishJobsQuerySchema, response: { 200: listPublishJobsResponseSchema } } }, async (request) => {
      const summaries = await publishJobRepository.listSummaries(request.query);
      return { jobs: summaries.map(presentPublishJob) };
    });

    server.get(apiRoutePatterns.publishJob, { schema: { params: publishJobParametersSchema, response: { 200: publishJobViewSchema, 404: errorResponseSchema } } }, async (request, reply) => {
      const summary = await publishJobRepository.findSummary(request.params.publishJobId);
      return summary ? presentPublishJob(summary) : reply.code(404).send({ error: 'Publish job not found' });
    });

    server.post(apiRoutePatterns.retryPublishJob, { schema: { params: publishJobParametersSchema, response: { 200: retryPublishJobResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema } } }, async (request, reply) => {
      const outcome = await retryPublishJob(dependencies, request.params.publishJobId);
      if (outcome.result === 'not_found') return reply.code(404).send({ error: 'Publish job not found' });
      if (outcome.result === 'not_retryable') return reply.code(409).send({ error: `A ${outcome.status} job cannot be retried` });
      request.log.info({ correlationId: request.params.publishJobId }, 'Publish job retried from the dashboard');
      return { job: presentPublishJob(outcome.job) };
    });
  };
}
