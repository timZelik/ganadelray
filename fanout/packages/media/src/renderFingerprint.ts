import { createHash } from 'node:crypto';
import type { MediaMetadata } from '@fanout/domain';
import { chooseOutputFrameRate } from './ffmpegArguments.ts';
import type { MediaProfile } from './mediaProfile.ts';
import { findProfileViolations } from './profileConformance.ts';

/**
 * What ffmpeg will actually produce for this master: either the master itself, or an encode described only by
 * parameters that change the output bytes. Platform caps (file size, frame-rate range) are deliberately absent,
 * so Reels, TikTok and Shorts share a single encode when their outputs would be identical.
 */
export function describeRenderOutput(profile: MediaProfile, sourceMetadata: MediaMetadata): Record<string, unknown> {
  if (findProfileViolations(sourceMetadata, profile).length === 0) return { output: 'passthrough' };
  const { maximumFileSizeBytes: _size, minimumFrameRate: _minimum, maximumFrameRate: _maximum, ...encodeParameters } = profile;
  return { output: 'encode', ...encodeParameters, outputFrameRate: chooseOutputFrameRate(sourceMetadata.frameRate, profile) };
}

function canonicalJson(value: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

/** Same master + same output description ⇒ same fingerprint ⇒ the render is reused instead of re-encoded. */
export function computeRenderFingerprint(masterChecksum: string, profile: MediaProfile, sourceMetadata: MediaMetadata): string {
  return createHash('sha256').update(masterChecksum).update('\u0000').update(canonicalJson(describeRenderOutput(profile, sourceMetadata))).digest('hex');
}
