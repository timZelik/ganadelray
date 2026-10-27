import { unlimitedRateLimitPolicy, validateAgainstCapabilities, type PostDraft, type PreparedAsset, type PublishAttempt, type Publisher, type PublishContext } from '@fanout/connectors-core';
import { destinationCapabilities, type DestinationKind } from '@fanout/domain';

function describePost(destinationKind: DestinationKind, asset: PreparedAsset, post: PostDraft) {
  return {
    destination: destinationKind,
    title: post.title,
    caption: post.caption,
    hashtags: post.hashtags,
    media: {
      storageKey: asset.storageKey,
      publicUrl: asset.publicUrl ? asset.publicUrl.replace(/\?.*$/, '?[signature omitted]') : null,
      durationSeconds: asset.metadata.durationSeconds,
      resolution: `${asset.metadata.width}x${asset.metadata.height}`,
      sizeBytes: asset.metadata.sizeBytes,
    },
  };
}

/**
 * Stands in for any destination: same capabilities and validation as the real platform,
 * but "publishing" means writing the post to the log. Lets the whole pipeline run before any API keys exist.
 */
export function createConsolePublisher(destinationKind: DestinationKind): Publisher {
  const capabilities = destinationCapabilities[destinationKind];
  return {
    route: 'console',
    destinationKind,
    capabilities,
    rateLimitPolicy: unlimitedRateLimitPolicy('console'),
    requiresConnection: false,
    validate: (asset, post) => validateAgainstCapabilities(capabilities, asset, post),
    async publish(_connection, asset, post, context: PublishContext): Promise<PublishAttempt> {
      const requestPreview = describePost(destinationKind, asset, post);
      context.logger.info({ correlationId: context.correlationId, consolePost: requestPreview, dryRun: context.dryRun }, `ConsolePublisher: would publish to ${destinationKind}`);
      return {
        outcome: context.dryRun ? 'dry_run' : 'published',
        externalPostId: context.dryRun ? null : `console-${asset.assetId}`,
        externalPostUrl: null,
        requestPreview,
      };
    },
  };
}
