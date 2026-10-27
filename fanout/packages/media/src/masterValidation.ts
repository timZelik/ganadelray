import { PermanentError, type MediaMetadata } from '@fanout/domain';

/** Rejects masters no destination could use, with an error the dashboard can show as-is. */
export function assertUsableMaster(metadata: MediaMetadata, minimumDurationSeconds: number): void {
  if (!(metadata.durationSeconds > 0)) throw new PermanentError('Master has no measurable duration (corrupt or truncated file)');
  if (metadata.durationSeconds < minimumDurationSeconds) {
    throw new PermanentError(`Master is ${metadata.durationSeconds}s long; the minimum is ${minimumDurationSeconds}s`);
  }
}
