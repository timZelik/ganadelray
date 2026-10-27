import { oneDayInMilliseconds, validateAgainstCapabilities, type Publisher } from '@fanout/connectors-core';
import { destinationCapabilities, PermanentError, ReauthRequiredError, type DestinationKind } from '@fanout/domain';
import { createBufferPost } from './bufferClient.ts';
import { bufferMetadataFor } from './bufferServices.ts';

/** Conservative: Buffer's free plan is assumed to allow ~100 API requests per 24h per key. */
const bufferRateLimitPolicy = { platformKey: 'buffer', windows: [{ scope: 'connection' as const, maximumOperations: 100, windowMilliseconds: oneDayInMilliseconds }] };

function channelIdFrom(publisherSettings: Record<string, unknown>, destinationKind: DestinationKind): string {
  const channelId = publisherSettings.channelId;
  if (typeof channelId !== 'string' || channelId === '') throw new PermanentError(`Choose which Buffer channel ${destinationKind} should post to`);
  return channelId;
}

/** Posts through Buffer, which holds the actual TikTok/Instagram/YouTube/LinkedIn connections. Buffer pulls the video from a public URL. */
export function createBufferPublisher(destinationKind: DestinationKind): Publisher {
  const capabilities = { ...destinationCapabilities[destinationKind], needsPublicUrl: true };
  return {
    route: 'buffer',
    destinationKind,
    capabilities,
    rateLimitPolicy: bufferRateLimitPolicy,
    requiresConnection: true,
    validate: (asset, post) => validateAgainstCapabilities(capabilities, asset, post),
    async publish(connection, asset, post, context) {
      const apiKey = connection?.tokenSet?.accessToken;
      if (!connection || !apiKey) throw new ReauthRequiredError('Buffer is not connected', connection ? { connectionId: connection.id } : {});
      const metadata = bufferMetadataFor(destinationKind, post.title);
      const { postId } = await createBufferPost(
        { http: context.http, apiKey, correlationId: context.correlationId, connectionId: connection.id },
        {
          channelId: channelIdFrom(context.publisherSettings, destinationKind),
          text: post.caption,
          schedulingType: 'automatic',
          mode: 'shareNow',
          assets: { videos: [{ url: asset.publicUrl! }] },
          ...(metadata ? { metadata } : {}),
        },
      );
      return { outcome: context.dryRun ? 'dry_run' : 'published', externalPostId: context.dryRun ? null : postId, externalPostUrl: null, requestPreview: null };
    },
  };
}
