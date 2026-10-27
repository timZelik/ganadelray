import type { HttpClient } from '@fanout/connectors-core';
import { PermanentError, ReauthRequiredError, RetryableError, type ErrorKind } from '@fanout/domain';
import type { z } from 'zod';
import {
  bufferApiUrl, channelsDataSchema, channelsQuery, createPostDataSchema, createPostMutation, graphqlResponseSchema, organizationsDataSchema, organizationsQuery,
  type BufferChannel, type CreatePostInput,
} from './bufferOperations.ts';

const authenticationErrorCodes = new Set(['UNAUTHENTICATED', 'FORBIDDEN', 'UNAUTHORIZED']);

function classifyBufferHttpError(statusCode: number): ErrorKind | null {
  return statusCode === 401 || statusCode === 403 ? 'reauth_required' : null;
}

export interface BufferRequestContext {
  http: HttpClient;
  apiKey: string;
  correlationId: string;
  connectionId?: string | null;
}

interface GraphqlRequest<Data extends z.ZodType> {
  query: string;
  variables?: Record<string, unknown>;
  dataSchema: Data;
  idempotent: boolean;
  dryRunData?: z.input<Data>;
}

function raiseGraphqlErrors(errors: Array<{ message: string; extensions?: { code?: string } }>, connectionId: string | null | undefined): never {
  const message = `Buffer: ${errors.map((error) => error.message).join('; ')}`;
  if (errors.some((error) => authenticationErrorCodes.has(error.extensions?.code ?? ''))) {
    throw new ReauthRequiredError(`${message}. Reconnect Buffer with a new API key.`, connectionId ? { connectionId } : {});
  }
  if (errors.some((error) => error.extensions?.code === 'RATE_LIMITED')) throw new RetryableError(message);
  throw new PermanentError(message);
}

async function sendGraphql<Data extends z.ZodType>(context: BufferRequestContext, request: GraphqlRequest<Data>): Promise<z.output<Data>> {
  const responseSchema = graphqlResponseSchema(request.dataSchema);
  const { body } = await context.http.request({
    method: 'POST',
    url: bufferApiUrl,
    correlationId: context.correlationId,
    connectionId: context.connectionId ?? null,
    headers: { authorization: `Bearer ${context.apiKey}` },
    jsonBody: { query: request.query, variables: request.variables ?? {} },
    responseSchema,
    idempotent: request.idempotent,
    classifyErrorResponse: classifyBufferHttpError,
    ...(request.dryRunData !== undefined ? { dryRunResponse: { data: request.dryRunData } } : {}),
  });
  if (body.errors?.length) raiseGraphqlErrors(body.errors, context.connectionId);
  if (!body.data) throw new PermanentError('Buffer returned no data');
  return body.data;
}

export interface BufferAccountSummary {
  organizationId: string;
  organizationName: string;
  channels: BufferChannel[];
}

/** Validates an API key and lists the channels (connected social accounts) it can post to. */
export async function fetchBufferAccount(context: BufferRequestContext): Promise<BufferAccountSummary> {
  const { account } = await sendGraphql(context, { query: organizationsQuery, dataSchema: organizationsDataSchema, idempotent: true });
  const organization = account.organizations[0];
  if (!organization) throw new PermanentError('This Buffer account has no organization');
  const { channels } = await sendGraphql(context, { query: channelsQuery, variables: { organizationId: organization.id }, dataSchema: channelsDataSchema, idempotent: true });
  return { organizationId: organization.id, organizationName: organization.name, channels };
}

/** One post on one channel. Never retried on 5xx (it may already have been created). */
export async function createBufferPost(context: BufferRequestContext, input: CreatePostInput): Promise<{ postId: string }> {
  const { createPost } = await sendGraphql(context, {
    query: createPostMutation,
    variables: { input },
    dataSchema: createPostDataSchema,
    idempotent: false,
    dryRunData: { createPost: { post: { id: 'dry-run-post', status: 'sending' } } },
  });
  if ('message' in createPost) throw new PermanentError(`Buffer refused the post: ${createPost.message}`);
  return { postId: createPost.post.id };
}
