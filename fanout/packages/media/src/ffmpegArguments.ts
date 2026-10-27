import type { MediaMetadata } from '@fanout/domain';
import type { MediaProfile } from './mediaProfile.ts';

export interface RenderPlan {
  inputPath: string;
  outputPath: string;
  profile: MediaProfile;
  sourceMetadata: MediaMetadata;
}

const outputFrameRateWhenTooSlow = 30;

function fitFilter({ width, height, fitMode }: MediaProfile): string {
  return fitMode === 'pad'
    ? `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`
    : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
}

/** Keeps the source frame rate when it is within the platform's range, otherwise clamps it. */
export function chooseOutputFrameRate(sourceFrameRate: number, { minimumFrameRate, maximumFrameRate }: MediaProfile): number {
  if (sourceFrameRate > maximumFrameRate) return maximumFrameRate;
  if (sourceFrameRate < minimumFrameRate) return Math.min(maximumFrameRate, Math.max(minimumFrameRate, outputFrameRateWhenTooSlow));
  return sourceFrameRate;
}

function videoFilterChain(plan: RenderPlan, outputFrameRate: number): string {
  const frameRateFilter = outputFrameRate !== plan.sourceMetadata.frameRate ? [`fps=${outputFrameRate}`] : [];
  return [fitFilter(plan.profile), 'setsar=1', ...frameRateFilter, `format=${plan.profile.pixelFormat}`].join(',');
}

function inputArguments(plan: RenderPlan): string[] {
  const silentAudioSource = ['-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=${plan.profile.audioSampleRateHz}`];
  return ['-i', plan.inputPath, ...(plan.sourceMetadata.audioCodec === null ? silentAudioSource : [])];
}

/** Masters without audio get a silent track: several platforms reject or mishandle video-only uploads. */
function streamMappingArguments(plan: RenderPlan): string[] {
  return plan.sourceMetadata.audioCodec === null ? ['-map', '0:v:0', '-map', '1:a:0', '-shortest'] : ['-map', '0:v:0', '-map', '0:a:0'];
}

function videoEncodingArguments(profile: MediaProfile, outputFrameRate: number): string[] {
  const keyframeInterval = String(Math.max(1, Math.round(outputFrameRate * profile.keyframeIntervalSeconds)));
  return [
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'medium',
    '-crf', String(profile.constantRateFactor),
    '-maxrate', `${profile.maximumVideoBitrateKilobits}k`, '-bufsize', `${profile.maximumVideoBitrateKilobits * 2}k`,
    // Fixed, closed GOPs: platforms re-segment uploads and dislike open GOPs and scene-cut keyframes.
    '-g', keyframeInterval, '-keyint_min', keyframeInterval, '-sc_threshold', '0', '-flags', '+cgop',
  ];
}

function audioEncodingArguments(profile: MediaProfile): string[] {
  return ['-c:a', 'aac', '-b:a', `${profile.audioBitrateKilobits}k`, '-ar', String(profile.audioSampleRateHz), '-ac', String(profile.audioChannels)];
}

/** Pure: the full ffmpeg argument list for one rendition. Metadata is stripped so phone GPS tags never leak. */
export function buildRenderArguments(plan: RenderPlan): string[] {
  const outputFrameRate = chooseOutputFrameRate(plan.sourceMetadata.frameRate, plan.profile);
  return [
    '-hide_banner', '-nostdin', '-y', '-loglevel', 'error',
    ...inputArguments(plan),
    ...streamMappingArguments(plan),
    '-vf', videoFilterChain(plan, outputFrameRate),
    ...videoEncodingArguments(plan.profile, outputFrameRate),
    ...audioEncodingArguments(plan.profile),
    '-map_metadata', '-1',
    '-movflags', '+faststart',
    '-f', 'mp4', plan.outputPath,
  ];
}
