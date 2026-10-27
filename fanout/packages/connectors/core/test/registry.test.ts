import { destinationCapabilities, PermanentError } from '@fanout/domain';
import { describe, expect, it } from 'vitest';
import { createConnectorRegistry, unlimitedRateLimitPolicy, type Publisher } from '../src/index.ts';

function stubPublisher(route: Publisher['route'], destinationKind: Publisher['destinationKind']): Publisher {
  return {
    route, destinationKind, capabilities: destinationCapabilities[destinationKind], rateLimitPolicy: unlimitedRateLimitPolicy(route), requiresConnection: false,
    validate: () => ({ valid: true, problems: [] }),
    publish: async () => ({ outcome: 'dry_run', externalPostId: null, externalPostUrl: null, requestPreview: null }),
  };
}

describe('createConnectorRegistry', () => {
  it('resolves publishers by route and destination, so TikTok can go direct or through a proxy', () => {
    const viaBuffer = stubPublisher('buffer', 'tiktok');
    const direct = stubPublisher('direct', 'tiktok');
    const registry = createConnectorRegistry([{ name: 'buffer', publishers: [viaBuffer] }, { name: 'tiktok', publishers: [direct] }]);
    expect(registry.getPublisher('buffer', 'tiktok')).toBe(viaBuffer);
    expect(registry.getPublisher('direct', 'tiktok')).toBe(direct);
    expect(registry.listPublishers()).toHaveLength(2);
  });

  it('fails a job permanently when no connector is installed for the route', () => {
    const registry = createConnectorRegistry([]);
    expect(() => registry.getPublisher('direct', 'x')).toThrow(PermanentError);
    expect(() => registry.getSourceWatcher('rss')).toThrow(PermanentError);
  });

  it('refuses two modules claiming the same publisher at startup', () => {
    expect(() => createConnectorRegistry([{ name: 'a', publishers: [stubPublisher('direct', 'x')] }, { name: 'b', publishers: [stubPublisher('direct', 'x')] }])).toThrow(/same publisher/);
  });
});
