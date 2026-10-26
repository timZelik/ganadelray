import type { Connection, DestinationKind, MediaMetadata, PublisherCapabilities, PublisherRoute } from '@fanout/domain';
import type { Logger } from '@fanout/logging';
import type { HttpClient } from './http/httpTypes.ts';
import type { RateLimitPolicy } from './rateLimitPolicy.ts';

export interface PreparedAsset {
  assetId: string;
  storageKey: string;
  metadata: MediaMetadata;
  /** Presigned URL for platforms that pull media; `null` when the publisher does not need one. */
  publicUrl: string | null;
  openReadStream(): Promise<ReadableStream<Uint8Array>>;
}

export interface PostDraft {
  caption: string;
  title: string | null;
  hashtags: string[];
}

export interface PublishContext {
  dryRun: boolean;
  correlationId: string;
  logger: Logger;
  /** In dry-run mode this client records requests instead of sending them. */
  http: HttpClient;
}

export type PublishOutcome = 'published' | 'processing' | 'dry_run';

export interface PublishAttempt {
  outcome: PublishOutcome;
  externalPostId: string | null;
  externalPostUrl: string | null;
  /** Every request sent (or, in dry-run, that would have been sent), redacted. */
  requestPreview: unknown;
}

export type PublishStatus =
  | { state: 'processing' }
  | { state: 'published'; externalPostId: string; externalPostUrl: string | null }
  | { state: 'failed'; reason: string };

export interface ValidationResult {
  valid: boolean;
  problems: string[];
}

export interface Publisher {
  readonly route: PublisherRoute;
  readonly destinationKind: DestinationKind;
  readonly capabilities: PublisherCapabilities;
  readonly rateLimitPolicy: RateLimitPolicy;
  /** `false` for publishers like ConsolePublisher that need no connected account. */
  readonly requiresConnection: boolean;
  validate(asset: PreparedAsset, post: PostDraft): ValidationResult;
  publish(connection: Connection | null, asset: PreparedAsset, post: PostDraft, context: PublishContext): Promise<PublishAttempt>;
  pollStatus?(connection: Connection | null, attempt: PublishAttempt): Promise<PublishStatus>;
}
