import { stat } from 'node:fs/promises';
import { PermanentError, type MediaMetadata } from '@fanout/domain';
import { z } from 'zod';
import { detectFastStart } from './fastStart.ts';
import { runProcess } from './processRunner.ts';

const ffprobeStreamSchema = z.object({
  codec_type: z.string(),
  codec_name: z.string().optional(),
  profile: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  pix_fmt: z.string().optional(),
  avg_frame_rate: z.string().optional(),
  r_frame_rate: z.string().optional(),
  sample_rate: z.string().optional(),
  tags: z.object({ rotate: z.string().optional() }).loose().optional(),
  side_data_list: z.array(z.object({ rotation: z.number().optional() }).loose()).optional(),
});

const ffprobeOutputSchema = z.object({
  streams: z.array(ffprobeStreamSchema),
  format: z.object({
    format_name: z.string(),
    duration: z.string().optional(),
    tags: z.object({ major_brand: z.string().optional() }).loose().optional(),
  }),
});

type FfprobeStream = z.infer<typeof ffprobeStreamSchema>;

export function parseFrameRate(rational: string | undefined): number {
  const [numerator, denominator] = (rational ?? '0/1').split('/').map(Number);
  if (!numerator || !denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function readRotationDegrees(stream: FfprobeStream): number {
  const rotation = stream.side_data_list?.find((sideData) => sideData.rotation !== undefined)?.rotation ?? Number(stream.tags?.rotate ?? 0);
  return ((Math.round(rotation) % 360) + 360) % 360;
}

function displayDimensions(stream: FfprobeStream, rotationDegrees: number): { width: number; height: number } {
  const isQuarterTurn = rotationDegrees === 90 || rotationDegrees === 270;
  const [width, height] = isQuarterTurn ? [stream.height, stream.width] : [stream.width, stream.height];
  return { width: width ?? 0, height: height ?? 0 };
}

async function runFfprobe(ffprobePath: string, filePath: string): Promise<z.infer<typeof ffprobeOutputSchema>> {
  const ffprobeArguments = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath];
  const { stdout } = await runProcess(ffprobePath, ffprobeArguments, { timeoutMilliseconds: 60_000 }).catch((probeError: unknown) => {
    throw new PermanentError(`File is not readable media (corrupt or unsupported): ${String(probeError)}`, { cause: probeError });
  });
  const parsed = ffprobeOutputSchema.safeParse(JSON.parse(stdout));
  if (!parsed.success) throw new PermanentError(`Unexpected ffprobe output: ${parsed.error.message}`);
  return parsed.data;
}

/** ffprobe → normalized MediaMetadata. Throws PermanentError for corrupt files or files without video. */
export async function probeMedia(filePath: string, ffprobePath = 'ffprobe'): Promise<MediaMetadata> {
  const [probe, fileStats, hasFastStart] = await Promise.all([runFfprobe(ffprobePath, filePath), stat(filePath), detectFastStart(filePath)]);
  const videoStream = probe.streams.find((stream) => stream.codec_type === 'video');
  if (!videoStream?.codec_name) throw new PermanentError('File has no video stream');
  const audioStream = probe.streams.find((stream) => stream.codec_type === 'audio');
  const rotationDegrees = readRotationDegrees(videoStream);
  const dimensions = displayDimensions(videoStream, rotationDegrees);
  if (dimensions.width === 0 || dimensions.height === 0) throw new PermanentError('Video stream has no dimensions (corrupt file?)');
  return {
    formatName: probe.format.format_name,
    majorBrand: probe.format.tags?.major_brand?.trim() || null,
    durationSeconds: Number(probe.format.duration ?? 0),
    sizeBytes: fileStats.size,
    ...dimensions,
    rotationDegrees,
    frameRate: parseFrameRate(videoStream.avg_frame_rate) || parseFrameRate(videoStream.r_frame_rate),
    videoCodec: videoStream.codec_name,
    videoProfile: videoStream.profile ?? null,
    pixelFormat: videoStream.pix_fmt ?? null,
    audioCodec: audioStream?.codec_name ?? null,
    audioSampleRateHz: audioStream?.sample_rate ? Number(audioStream.sample_rate) : null,
    hasFastStart,
  };
}
