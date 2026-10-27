import { apiRoutes, listVideosResponseSchema, uploadStatusResponseSchema } from '@fanout/api-contract';
import { describe, expect, it } from 'vitest';
import { buildApiServer } from '../src/server.ts';
import { buildFakeApiDependencies, buildSourceItem, buildSummary, nextIdentifier, signedIn, uploadConnectionId } from './fakeApiDependencies.ts';

function multipartBody(fields: Record<string, string>, file: { name: string; content: Buffer; contentType: string } | null) {
  const boundary = 'fanout-test-boundary';
  const parts = Object.entries(fields).map(([name, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  const filePart = file ? [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${file.name}"\r\nContent-Type: ${file.contentType}\r\n\r\n`), file.content, Buffer.from('\r\n')] : [];
  return { payload: Buffer.concat([Buffer.from(parts.join('')), ...filePart, Buffer.from(`--${boundary}--\r\n`)]), headers: { ...signedIn, 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('video routes', () => {
  it('groups posts under each video and speaks in plain states', async () => {
    const fake = buildFakeApiDependencies();
    const video = buildSourceItem();
    fake.sourceItems.push(video);
    fake.summaries.set('a', buildSummary({ id: nextIdentifier(), sourceItemId: video.id, status: 'published', dryRun: true, destinationKind: 'instagram_reels' }));
    fake.summaries.set('b', buildSummary({ id: nextIdentifier(), sourceItemId: video.id, status: 'published', dryRun: false, destinationKind: 'tiktok', externalPostUrl: 'https://tiktok.com/@gana/1' }));
    fake.summaries.set('c', buildSummary({ id: nextIdentifier(), sourceItemId: video.id, status: 'failed', dryRun: false, destinationKind: 'linkedin', lastError: 'Not publishable to linkedin: Video is 2s; minimum is 3s' }));
    fake.summaries.set('d', buildSummary({ id: nextIdentifier(), sourceItemId: video.id, status: 'preparing', dryRun: false, destinationKind: 'youtube_shorts' }));
    const server = await buildApiServer(fake.dependencies);
    const { videos } = listVideosResponseSchema.parse((await server.inject({ method: 'GET', url: apiRoutes.videos, headers: signedIn })).json());
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({ title: 'Studio tour', durationSeconds: 8, thumbnailUrl: apiRoutes.videoThumbnail(video.id) });
    expect(videos[0]!.posts.map((post) => [post.destinationKind, post.state, post.problem, post.canRetry])).toEqual([
      ['instagram_reels', 'practice', null, false],
      ['tiktok', 'posted', null, false],
      ['linkedin', 'failed', 'Too short for this platform: it needs at least 3 seconds.', true],
      ['youtube_shorts', 'working', null, false],
    ]);
    expect(videos[0]!.posts[1]!.postUrl).toBe('https://tiktok.com/@gana/1');
  });

  it('streams an upload into storage and queues it for processing with its caption', async () => {
    const fake = buildFakeApiDependencies();
    const server = await buildApiServer(fake.dependencies);
    const response = await server.inject({ method: 'POST', url: apiRoutes.videos, ...multipartBody({ caption: 'New studio corner 🎨', title: '' }, { name: 'studio-corner_v2.mov', content: Buffer.from('fake video bytes'), contentType: 'video/quicktime' }) });
    expect(response.statusCode).toBe(202);
    const { uploadId } = response.json();
    expect(fake.enqueuedIngests).toEqual([{
      connectionId: uploadConnectionId,
      candidate: { externalId: uploadId, title: 'studio corner v2', originalCaption: 'New studio corner 🎨', detectedAt: '2026-10-26T12:00:00.000Z', locator: { storageKey: `uploads/${uploadId}.mov`, fileName: 'studio-corner_v2.mov' } },
    }]);
    expect(fake.storage.objects.get(`uploads/${uploadId}.mov`)!.body.toString()).toBe('fake video bytes');
  });

  it('refuses non-video files and files over the size limit, keeping nothing', async () => {
    const fake = buildFakeApiDependencies();
    const server = await buildApiServer(fake.dependencies);
    const notVideo = await server.inject({ method: 'POST', url: apiRoutes.videos, ...multipartBody({}, { name: 'notes.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' }) });
    expect(notVideo.statusCode).toBe(400);
    expect(notVideo.json().error).toMatch(/video file/);
    const tooBig = await server.inject({ method: 'POST', url: apiRoutes.videos, ...multipartBody({}, { name: 'huge.mp4', content: Buffer.alloc(6 * 1_048_576), contentType: 'video/mp4' }) });
    expect(tooBig.statusCode).toBe(413);
    expect(fake.storage.objects.size).toBe(0);
    expect(fake.enqueuedIngests).toEqual([]);
  });

  it('reports upload progress, including why processing failed', async () => {
    const fake = buildFakeApiDependencies();
    const server = await buildApiServer(fake.dependencies);
    const uploadId = nextIdentifier();
    const status = async () => uploadStatusResponseSchema.parse((await server.inject({ method: 'GET', url: apiRoutes.uploadStatus(uploadId), headers: signedIn })).json());
    expect(await status()).toEqual({ state: 'processing', problem: null, videoId: null });
    fake.ingestOutcomes.set(uploadId, { state: 'failed', reason: 'File is not readable media (corrupt or unsupported)' });
    expect(await status()).toEqual({ state: 'failed', problem: "We couldn't read this file. Try exporting it again as an MP4.", videoId: null });
    const videoId = nextIdentifier();
    fake.ingestOutcomes.set(uploadId, { state: 'done', sourceItemId: videoId });
    expect(await status()).toEqual({ state: 'done', problem: null, videoId });
  });

  it('serves the thumbnail to signed-in users only', async () => {
    const fake = buildFakeApiDependencies();
    const video = buildSourceItem();
    fake.sourceItems.push(video);
    await fake.storage.upload(video.thumbnailStorageKey!, Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg');
    const server = await buildApiServer(fake.dependencies);
    const response = await server.inject({ method: 'GET', url: apiRoutes.videoThumbnail(video.id), headers: signedIn });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect((await server.inject({ method: 'GET', url: apiRoutes.videoThumbnail(video.id) })).statusCode).toBe(401);
  });
});
