import type { MediaMetadata } from '@fanout/domain';
import { buildRenderArguments } from './ffmpegArguments.ts';
import type { MediaProfile } from './mediaProfile.ts';
import { probeMedia } from './probe.ts';
import { runProcess } from './processRunner.ts';
import { findProfileViolations } from './profileConformance.ts';

export interface MediaToolPaths {
  ffmpegPath: string;
  ffprobePath: string;
}

export interface RenditionRequest {
  inputPath: string;
  outputPath: string;
  profile: MediaProfile;
  sourceMetadata: MediaMetadata;
}

export interface Rendition {
  outputPath: string;
  metadata: MediaMetadata;
  /** True when the master already satisfies the profile: `outputPath` is then the input itself, nothing was encoded. */
  passedThrough: boolean;
  /** Why re-encoding was needed (empty when passed through). */
  reasons: string[];
}

const minimumRenderTimeoutMilliseconds = 120_000;
const renderTimeoutPerSourceSecondMilliseconds = 20_000;

function renderTimeoutFor(sourceMetadata: MediaMetadata): number {
  return Math.max(minimumRenderTimeoutMilliseconds, sourceMetadata.durationSeconds * renderTimeoutPerSourceSecondMilliseconds);
}

/** Produces the file one destination profile needs: the master itself when it conforms, an ffmpeg encode otherwise. */
export async function renderRendition(request: RenditionRequest, tools: MediaToolPaths): Promise<Rendition> {
  const reasons = findProfileViolations(request.sourceMetadata, request.profile);
  if (reasons.length === 0) {
    return { outputPath: request.inputPath, metadata: request.sourceMetadata, passedThrough: true, reasons };
  }
  await runProcess(tools.ffmpegPath, buildRenderArguments(request), { timeoutMilliseconds: renderTimeoutFor(request.sourceMetadata) });
  return { outputPath: request.outputPath, metadata: await probeMedia(request.outputPath, tools.ffprobePath), passedThrough: false, reasons };
}
