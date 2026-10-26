import type { DestinationKind, PublisherRoute } from '@fanout/api-contract';

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const relativeTimeUnits: Array<[Intl.RelativeTimeFormatUnit, number]> = [['day', 86_400], ['hour', 3_600], ['minute', 60], ['second', 1]];

export function formatRelativeTime(isoDate: string, now: number = Date.now()): string {
  const elapsedSeconds = Math.round((new Date(isoDate).getTime() - now) / 1000);
  const [unit, secondsPerUnit] = relativeTimeUnits.find(([, seconds]) => Math.abs(elapsedSeconds) >= seconds) ?? ['second', 1];
  return relativeTimeFormatter.format(Math.round(elapsedSeconds / secondsPerUnit), unit);
}

export const destinationLabels: Record<DestinationKind, string> = {
  instagram_reels: 'Instagram Reels', instagram_stories: 'Instagram Stories', instagram_feed: 'Instagram Feed', facebook_reels: 'Facebook Reels',
  youtube_shorts: 'YouTube Shorts', tiktok: 'TikTok', linkedin: 'LinkedIn', threads: 'Threads', pinterest: 'Pinterest', x: 'X', archive: 'Archive',
};

export const routeLabels: Record<PublisherRoute, string> = { direct: 'Direct API', buffer: 'via Buffer', upload_post: 'via Upload-Post', console: 'Console (log only)' };
