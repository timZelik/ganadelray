import { createConnectorRegistry, type PreparedAsset } from '@fanout/connectors-core';
import { destinationKinds } from '@fanout/domain';
import { buildMediaMetadata, createSilentLogger } from '@fanout/testing';
import { describe, expect, it } from 'vitest';
import { consoleConnectorModule, createConsolePublisher } from '../src/index.ts';

const asset: PreparedAsset = {
  assetId: 'asset-1', storageKey: 'renditions/item/fingerprint.mp4', metadata: buildMediaMetadata(),
  publicUrl: 'https://storage.test/renditions/item/fingerprint.mp4?X-Amz-Signature=secret', openReadStream: async () => new ReadableStream(),
};
const post = { caption: 'Hello #reels', title: null, hashtags: ['#reels'] };
const context = (dryRun: boolean) => ({ dryRun, correlationId: 'correlation-1', logger: createSilentLogger(), http: { request: async () => { throw new Error('ConsolePublisher must not make HTTP calls'); } }, publisherSettings: {} });

describe('ConsolePublisher', () => {
  it('registers a console route for every destination kind', () => {
    const registry = createConnectorRegistry([consoleConnectorModule]);
    expect(destinationKinds.map((kind) => registry.getPublisher('console', kind).destinationKind)).toEqual([...destinationKinds]);
  });

  it('validates with the real platform limits', () => {
    const tooLong = { ...asset, metadata: buildMediaMetadata({ durationSeconds: 200 }) };
    expect(createConsolePublisher('youtube_shorts').validate(tooLong, post).problems).toEqual(['Video is 200s; maximum is 180s']);
  });

  it('logs instead of posting and returns a request preview without the URL signature', async () => {
    const attempt = await createConsolePublisher('instagram_reels').publish(null, asset, post, context(true));
    expect(attempt).toMatchObject({ outcome: 'dry_run', externalPostId: null });
    expect(JSON.stringify(attempt.requestPreview)).not.toContain('secret');
    expect(attempt.requestPreview).toMatchObject({ destination: 'instagram_reels', caption: 'Hello #reels', media: { resolution: '1080x1920' } });
  });

  it('reports a synthetic post ID when not in dry-run mode', async () => {
    expect((await createConsolePublisher('tiktok').publish(null, asset, post, context(false))).externalPostId).toBe('console-asset-1');
  });
});
