import type { MediaMetadata } from '@fanout/domain';
import { runProcess } from './processRunner.ts';

const thumbnailWidth = 480;

/** A small JPEG from about a third of the way in (skips black intro frames); rotation is applied by ffmpeg. */
export async function extractThumbnail(inputPath: string, outputPath: string, metadata: MediaMetadata, ffmpegPath = 'ffmpeg'): Promise<string> {
  const seekSeconds = Math.min(3, metadata.durationSeconds / 3).toFixed(2);
  await runProcess(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', seekSeconds, '-i', inputPath, '-frames:v', '1', '-vf', `scale=${thumbnailWidth}:-2`, '-q:v', '4', outputPath], { timeoutMilliseconds: 60_000 });
  return outputPath;
}
