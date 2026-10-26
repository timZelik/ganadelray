import { countHashtags, type PublisherCapabilities } from '@fanout/domain';
import type { PostDraft, PreparedAsset, ValidationResult } from './publisher.ts';

type CapabilityCheck = (capabilities: PublisherCapabilities, asset: PreparedAsset, post: PostDraft) => string | null;

const capabilityChecks: CapabilityCheck[] = [
  ({ minimumDurationSeconds }, { metadata }) =>
    metadata.durationSeconds < minimumDurationSeconds ? `Video is ${metadata.durationSeconds}s; minimum is ${minimumDurationSeconds}s` : null,
  ({ maximumDurationSeconds }, { metadata }) =>
    metadata.durationSeconds > maximumDurationSeconds ? `Video is ${metadata.durationSeconds}s; maximum is ${maximumDurationSeconds}s` : null,
  ({ maximumFileSizeBytes }, { metadata }) =>
    metadata.sizeBytes > maximumFileSizeBytes ? `File is ${metadata.sizeBytes} bytes; maximum is ${maximumFileSizeBytes}` : null,
  ({ captionCharacterLimit }, _asset, { caption }) =>
    caption.length > captionCharacterLimit ? `Caption is ${caption.length} characters; limit is ${captionCharacterLimit}` : null,
  ({ titleCharacterLimit }, _asset, { title }) =>
    titleCharacterLimit !== null && title !== null && title.length > titleCharacterLimit ? `Title is ${title.length} characters; limit is ${titleCharacterLimit}` : null,
  ({ hashtagLimit }, _asset, { caption }) =>
    hashtagLimit !== null && countHashtags(caption) > hashtagLimit ? `Caption has ${countHashtags(caption)} hashtags; limit is ${hashtagLimit}` : null,
  ({ needsPublicUrl }, { publicUrl }) => (needsPublicUrl && publicUrl === null ? 'Platform pulls media from a public URL but none was provided' : null),
];

/** The checks every publisher shares; adapters add platform-specific ones on top. */
export function validateAgainstCapabilities(capabilities: PublisherCapabilities, asset: PreparedAsset, post: PostDraft): ValidationResult {
  const problems = capabilityChecks.map((check) => check(capabilities, asset, post)).filter((problem) => problem !== null);
  return { valid: problems.length === 0, problems };
}
