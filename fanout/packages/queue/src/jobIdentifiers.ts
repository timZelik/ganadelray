import { createHash } from 'node:crypto';

/** BullMQ forbids ':' and integer-looking custom IDs; external IDs can contain anything, so they are hashed. */
function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

export const jobIdentifiers = {
  ingest: (connectionId: string, externalId: string) => `ingest-${connectionId}-${shortHash(externalId)}`,
  prepare: (publishJobId: string) => `prepare-${publishJobId}`,
  publish: (publishJobId: string) => `publish-${publishJobId}`,
  /** A retry must not collide with the failed job BullMQ still keeps under the original ID. */
  retry: (publishJobId: string, requestedAt: number) => `prepare-${publishJobId}-retry-${requestedAt}`,
  watchScheduler: (connectionId: string) => `watch-${connectionId}`,
  purgeScheduler: () => 'purge-expired-assets',
};
