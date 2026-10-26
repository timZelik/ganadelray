import { z } from 'zod';

/**
 * Every Buffer GraphQL document and response shape lives here, so the integration is checked against
 * Buffer's docs (developers.buffer.com) in one place.
 *
 * VERIFICATION STATUS: endpoint, Bearer personal API key, `account.organizations`, `channels(input: { organizationId })`,
 * and `createPost` returning `PostActionSuccess | MutationError` follow Buffer's published guides as quoted in
 * third-party summaries. The video `assets` and per-network `metadata` fields are NOT yet verified against
 * the docs (they were unreachable from the build environment). See PROGRESS.md.
 */
export const bufferApiUrl = 'https://api.buffer.com';

export const organizationsQuery = /* GraphQL */ `
  query FanoutOrganizations {
    account { id email organizations { id name } }
  }
`;

export const channelsQuery = /* GraphQL */ `
  query FanoutChannels($organizationId: OrganizationId!) {
    channels(input: { organizationId: $organizationId }) { id name displayName service avatar isLocked }
  }
`;

export const createPostMutation = /* GraphQL */ `
  mutation FanoutCreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess { post { id status } }
      ... on MutationError { message }
    }
  }
`;

const graphqlErrorSchema = z.object({ message: z.string(), extensions: z.object({ code: z.string().optional() }).loose().optional() });

/** GraphQL answers HTTP 200 even for failures; errors and data both have to be inspected. */
export function graphqlResponseSchema<Data extends z.ZodType>(dataSchema: Data) {
  return z.object({ data: dataSchema.nullable().optional(), errors: z.array(graphqlErrorSchema).optional() });
}

export const organizationsDataSchema = z.object({
  account: z.object({ id: z.string(), email: z.string().nullable().optional(), organizations: z.array(z.object({ id: z.string(), name: z.string() })) }),
});

export const bufferChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string().nullable().optional(),
  service: z.string(),
  avatar: z.string().nullable().optional(),
  isLocked: z.boolean().nullable().optional(),
});
export type BufferChannel = z.infer<typeof bufferChannelSchema>;

export const channelsDataSchema = z.object({ channels: z.array(bufferChannelSchema) });

export const createPostDataSchema = z.object({
  createPost: z.union([
    z.object({ post: z.object({ id: z.string(), status: z.string().nullable().optional() }) }),
    z.object({ message: z.string() }),
  ]),
});

export interface CreatePostInput {
  channelId: string;
  text: string;
  schedulingType: 'automatic';
  mode: 'shareNow';
  assets: { videos: Array<{ url: string }> };
  metadata?: Record<string, unknown>;
}
