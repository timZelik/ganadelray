import { createDryRunHttpClient, createHttpClient, type PreparedAsset, type PublishContext } from '@fanout/connectors-core';
import { PermanentError, ReauthRequiredError, RetryableError, type Connection } from '@fanout/domain';
import { buildMediaMetadata, createRecordingAuditSink, createSilentLogger, useMockServer } from '@fanout/testing';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createBufferPublisher, fetchBufferAccount } from '../src/index.ts';

const server = useMockServer();
const bufferUrl = 'https://api.buffer.com/';
const connection = { id: 'buffer-connection', tokenSet: { accessToken: 'buffer-key', refreshToken: null, expiresAt: null, tokenType: 'Bearer' } } as Connection;
const asset: PreparedAsset = { assetId: 'asset-1', storageKey: 'k', metadata: buildMediaMetadata(), publicUrl: 'https://media.example/renditions/a.mp4?sig=1', openReadStream: async () => new ReadableStream() };
const post = { caption: 'Studio tour #art', title: 'Studio tour', hashtags: ['#art'] };

function liveHttpClient() {
  const auditSink = createRecordingAuditSink();
  return { auditSink, http: createHttpClient({ auditSink, logger: createSilentLogger(), sleep: async () => undefined }) };
}

function publishContext(overrides: Partial<PublishContext> = {}): PublishContext {
  return { dryRun: false, correlationId: 'correlation-1', logger: createSilentLogger(), http: liveHttpClient().http, publisherSettings: { channelId: 'channel-tiktok' }, ...overrides };
}

type GraphqlBody = { query: string; variables: Record<string, unknown> };

describe('fetchBufferAccount', () => {
  it('validates the key and lists the channels of its organization', async () => {
    const seen: GraphqlBody[] = [];
    server.use(http.post(bufferUrl, async ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer buffer-key');
      const body = (await request.json()) as GraphqlBody;
      seen.push(body);
      return body.query.includes('FanoutOrganizations')
        ? HttpResponse.json({ data: { account: { id: 'account-1', email: 'gana@example.com', organizations: [{ id: 'organization-1', name: 'Gana Studio' }] } } })
        : HttpResponse.json({ data: { channels: [{ id: 'channel-tiktok', name: 'gana', displayName: 'Gana', service: 'tiktok', avatar: null, isLocked: false }] } });
    }));
    const account = await fetchBufferAccount({ http: liveHttpClient().http, apiKey: 'buffer-key', correlationId: 'c' });
    expect(account).toMatchObject({ organizationId: 'organization-1', organizationName: 'Gana Studio', channels: [{ id: 'channel-tiktok', service: 'tiktok' }] });
    expect(seen[1]!.variables).toEqual({ organizationId: 'organization-1' });
  });

  it('turns an invalid key into a reconnect prompt', async () => {
    server.use(http.post(bufferUrl, () => HttpResponse.json({ errors: [{ message: 'Invalid token', extensions: { code: 'UNAUTHENTICATED' } }] })));
    await expect(fetchBufferAccount({ http: liveHttpClient().http, apiKey: 'wrong', correlationId: 'c' })).rejects.toBeInstanceOf(ReauthRequiredError);
  });
});

describe('BufferPublisher', () => {
  it('shares the video now on the chosen channel, with the presigned URL and never the key in the audit log', async () => {
    let sentInput: Record<string, unknown> | undefined;
    server.use(http.post(bufferUrl, async ({ request }) => {
      sentInput = ((await request.json()) as GraphqlBody).variables.input as Record<string, unknown>;
      return HttpResponse.json({ data: { createPost: { post: { id: 'buffer-post-1', status: 'sending' } } } });
    }));
    const { http: client, auditSink } = liveHttpClient();
    const attempt = await createBufferPublisher('tiktok').publish(connection, asset, post, publishContext({ http: client }));
    expect(attempt).toMatchObject({ outcome: 'published', externalPostId: 'buffer-post-1' });
    expect(sentInput).toEqual({ channelId: 'channel-tiktok', text: 'Studio tour #art', schedulingType: 'automatic', mode: 'shareNow', assets: { videos: [{ url: asset.publicUrl }] } });
    expect(JSON.stringify(auditSink.entries)).not.toContain('buffer-key');
  });

  it('adds the per-network metadata Reels and Shorts need', async () => {
    const inputs: Array<Record<string, unknown>> = [];
    server.use(http.post(bufferUrl, async ({ request }) => {
      inputs.push(((await request.json()) as GraphqlBody).variables.input as Record<string, unknown>);
      return HttpResponse.json({ data: { createPost: { post: { id: 'p' } } } });
    }));
    await createBufferPublisher('youtube_shorts').publish(connection, asset, post, publishContext());
    await createBufferPublisher('instagram_reels').publish(connection, asset, post, publishContext());
    expect(inputs[0]!.metadata).toEqual({ youtube: { title: 'Studio tour', categoryId: '22' } });
    expect(inputs[1]!.metadata).toEqual({ instagram: { type: 'reel', shouldShareToFeed: true } });
  });

  it('surfaces Buffer refusing a post (HTTP 200 MutationError) as a permanent, readable error', async () => {
    server.use(http.post(bufferUrl, () => HttpResponse.json({ data: { createPost: { message: 'Video is too long for this channel' } } })));
    await expect(createBufferPublisher('tiktok').publish(connection, asset, post, publishContext())).rejects.toThrow(new PermanentError('Buffer refused the post: Video is too long for this channel'));
  });

  it('retries rate limits but never re-sends a post after a server error', async () => {
    server.use(http.post(bufferUrl, () => new HttpResponse(null, { status: 503 })));
    const { http: client, auditSink } = liveHttpClient();
    await expect(createBufferPublisher('tiktok').publish(connection, asset, post, publishContext({ http: client }))).rejects.toBeInstanceOf(RetryableError);
    expect(auditSink.entries).toHaveLength(1);
  });

  it('asks for a channel when none is chosen, and for a connection when Buffer is disconnected', async () => {
    await expect(createBufferPublisher('tiktok').publish(connection, asset, post, publishContext({ publisherSettings: {} }))).rejects.toThrow(/Choose which Buffer channel/);
    await expect(createBufferPublisher('tiktok').publish(null, asset, post, publishContext())).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it('in dry-run mode records the exact request without calling Buffer', async () => {
    const dryRunHttp = createDryRunHttpClient(createSilentLogger());
    const attempt = await createBufferPublisher('linkedin').publish(connection, asset, post, publishContext({ dryRun: true, http: dryRunHttp }));
    expect(attempt.outcome).toBe('dry_run');
    expect(dryRunHttp.recordedRequests()).toHaveLength(1);
    expect(JSON.stringify(dryRunHttp.recordedRequests())).toContain('"authorization":"[REDACTED]"');
  });
});
