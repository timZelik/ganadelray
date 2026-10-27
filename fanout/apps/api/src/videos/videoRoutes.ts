import { apiRoutePatterns, apiRoutes, errorResponseSchema, listVideosResponseSchema, uploadFormFields, uploadParametersSchema, uploadResponseSchema, uploadStatusResponseSchema, videoParametersSchema, type UploadStatusResponse } from '@fanout/api-contract';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { ApiDependencies } from '../dependencies.ts';
import { toFriendlyProblem } from '../friendlyProblems.ts';
import { findUploadConnectionId, uploadVideo, type IncomingUpload } from './uploadVideo.ts';
import { presentVideo } from './videoPresenter.ts';

const recentVideoLimit = 60;

/** Reads text fields until the file part, then hands the file over as a stream (fields must be sent first). */
async function readUploadForm(request: FastifyRequest): Promise<IncomingUpload | null> {
  const fields: Record<string, string> = {};
  for await (const part of request.parts()) {
    if (part.type === 'field') fields[part.fieldname] = String(part.value);
    else if (part.fieldname === uploadFormFields.file) {
      return { fileName: part.filename, contentType: part.mimetype, stream: part.file, caption: fields[uploadFormFields.caption] ?? null, title: fields[uploadFormFields.title] ?? null };
    } else part.file.resume();
  }
  return null;
}

export function videoRoutes(dependencies: ApiDependencies): FastifyPluginAsyncZod {
  const { sourceItemRepository, publishJobRepository, storage, queues } = dependencies;
  return async (server) => {
    server.get(apiRoutes.videos, { schema: { response: { 200: listVideosResponseSchema } } }, async () => {
      const sourceItems = await sourceItemRepository.listRecent(recentVideoLimit);
      const jobs = await publishJobRepository.listSummariesForSourceItems(sourceItems.map((sourceItem) => sourceItem.id));
      return { videos: sourceItems.map((sourceItem) => presentVideo(sourceItem, jobs)) };
    });

    server.get(apiRoutePatterns.videoThumbnail, { schema: { params: videoParametersSchema } }, async (request, reply) => {
      const sourceItem = await sourceItemRepository.findById(request.params.videoId);
      if (!sourceItem?.thumbnailStorageKey) return reply.code(404).send({ error: 'No thumbnail' });
      const stream = await storage.openReadStream(sourceItem.thumbnailStorageKey);
      return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=86400').send(stream);
    });

    server.post(apiRoutes.videos, { schema: { response: { 202: uploadResponseSchema, 400: errorResponseSchema, 413: errorResponseSchema } } }, async (request, reply) => {
      const upload = await readUploadForm(request);
      if (!upload) return reply.code(400).send({ error: 'Choose a video to upload.' });
      const outcome = await uploadVideo(dependencies, upload);
      if (outcome.result === 'rejected') return reply.code(outcome.statusCode).send({ error: outcome.problem });
      request.log.info({ uploadId: outcome.uploadId, fileName: upload.fileName }, 'Video uploaded');
      return reply.code(202).send({ uploadId: outcome.uploadId });
    });

    server.get(apiRoutePatterns.uploadStatus, { schema: { params: uploadParametersSchema, response: { 200: uploadStatusResponseSchema } } }, async (request): Promise<UploadStatusResponse> => {
      const outcome = await queues.findIngestOutcome(await findUploadConnectionId(dependencies), request.params.uploadId);
      if (outcome.state === 'done') return { state: 'done', problem: null, videoId: outcome.sourceItemId };
      if (outcome.state === 'failed') return { state: 'failed', problem: toFriendlyProblem(outcome.reason), videoId: null };
      return { state: 'processing', problem: null, videoId: null };
    });
  };
}
