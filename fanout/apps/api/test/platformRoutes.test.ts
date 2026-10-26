import { apiRoutes, platformsResponseSchema } from '@fanout/api-contract';
import { describe, expect, it } from 'vitest';
import { buildApiServer } from '../src/server.ts';
import { buildFakeApiDependencies, signedIn } from './fakeApiDependencies.ts';

async function setup(options: { dryRun?: boolean } = {}) {
  const fake = buildFakeApiDependencies(options);
  const server = await buildApiServer(fake.dependencies);
  const call = async (method: 'GET' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) => {
    const response = await server.inject({ method, url, headers: signedIn, ...(payload ? { payload } : {}) });
    return { statusCode: response.statusCode, body: response.json() };
  };
  return { fake, call };
}

describe('platform settings', () => {
  it('starts in practice mode with nothing connected', async () => {
    const { call } = await setup();
    const settings = platformsResponseSchema.parse((await call('GET', apiRoutes.platforms)).body);
    expect(settings.buffer).toEqual({ connected: false, needsReconnect: false, organizationName: null, channels: [] });
    expect(settings.destinations.map((destination) => destination.mode)).toEqual(['practice', 'practice', 'practice', 'practice']);
  });

  it('connecting Buffer stores the key encrypted-at-rest and auto-assigns matching accounts', async () => {
    const { fake, call } = await setup();
    const { statusCode, body } = await call('PUT', apiRoutes.bufferConnection, { apiKey: 'valid-buffer-key' });
    expect(statusCode).toBe(200);
    const settings = platformsResponseSchema.parse(body);
    expect(settings.buffer).toMatchObject({ connected: true, organizationName: 'Gana Studio' });
    const byKind = Object.fromEntries(settings.destinations.map((destination) => [destination.destinationKind, destination]));
    expect(byKind.tiktok).toMatchObject({ channelId: 'channel-tiktok', mode: 'live' });
    expect(byKind.instagram_reels).toMatchObject({ channelId: 'channel-instagram', mode: 'live' });
    expect(byKind.youtube_shorts).toMatchObject({ channelId: null, mode: 'practice', channelOptions: [] });
    expect(byKind.tiktok!.channelOptions).toEqual([{ id: 'channel-tiktok', name: 'Gana', service: 'tiktok', avatar: null }]);
    const stored = [...fake.connections.values()].find((connection) => connection.platform === 'buffer')!;
    expect(stored.tokenSet!.accessToken).toBe('valid-buffer-key');
  });

  it('explains a rejected Buffer key in plain words', async () => {
    const { call } = await setup();
    const { statusCode, body } = await call('PUT', apiRoutes.bufferConnection, { apiKey: 'wrong-buffer-key' });
    expect(statusCode).toBe(400);
    expect(body.error).toMatch(/Buffer did not accept that API key/);
  });

  it('stays in practice mode while the server is in dry-run, even with Buffer connected', async () => {
    const { call } = await setup({ dryRun: true });
    const settings = platformsResponseSchema.parse((await call('PUT', apiRoutes.bufferConnection, { apiKey: 'valid-buffer-key' })).body);
    expect(settings.livePostingEnabled).toBe(false);
    expect(settings.destinations.every((destination) => destination.mode === 'practice')).toBe(true);
  });

  it('updates a platform: toggle, caption, hashtags (normalized) and account', async () => {
    const { fake, call } = await setup();
    await call('PUT', apiRoutes.bufferConnection, { apiKey: 'valid-buffer-key' });
    const linkedIn = fake.workflow.destinations.find((destination) => destination.destinationKind === 'linkedin')!;
    const settings = platformsResponseSchema.parse((await call('PATCH', apiRoutes.destination(linkedIn.id), { enabled: false, captionTemplate: '{{title}}\n\n{{originalCaption}}', hashtags: ['#art', ' studio ', ''] })).body);
    expect(settings.destinations.find((destination) => destination.id === linkedIn.id)).toMatchObject({ enabled: false, captionTemplate: '{{title}}\n\n{{originalCaption}}', hashtags: ['art', 'studio'] });
    const tiktok = fake.workflow.destinations.find((destination) => destination.destinationKind === 'tiktok')!;
    await call('PATCH', apiRoutes.destination(tiktok.id), { channelId: null });
    expect(fake.workflow.destinations.find((destination) => destination.id === tiktok.id)).toMatchObject({ publisherRoute: 'console', connectionId: null });
  });

  it('rejects caption templates with typos and accounts that are not connected', async () => {
    const { fake, call } = await setup();
    const tiktok = fake.workflow.destinations[1]!;
    const typo = await call('PATCH', apiRoutes.destination(tiktok.id), { captionTemplate: '{{orignalCaption}}' });
    expect(typo.statusCode).toBe(400);
    expect(typo.body.error).toMatch(/Unknown placeholder/);
    expect((await call('PATCH', apiRoutes.destination(tiktok.id), { channelId: 'channel-from-elsewhere' })).statusCode).toBe(400);
  });

  it('disconnecting puts every platform back into practice mode', async () => {
    const { fake, call } = await setup();
    await call('PUT', apiRoutes.bufferConnection, { apiKey: 'valid-buffer-key' });
    const settings = platformsResponseSchema.parse((await call('DELETE', apiRoutes.bufferConnection)).body);
    expect(settings.buffer.connected).toBe(false);
    expect(fake.workflow.destinations.every((destination) => destination.publisherRoute === 'console' && destination.connectionId === null)).toBe(true);
  });

  it('switches between filling the frame and showing the whole video', async () => {
    const { call } = await setup();
    expect(platformsResponseSchema.parse((await call('PUT', apiRoutes.fitMode, { fitMode: 'pad' })).body).fitMode).toBe('pad');
  });
});
