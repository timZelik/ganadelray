import type { VideoView } from '@fanout/api-contract';
import { Film } from 'lucide-react';
import { Card } from '../../components/ui/card.tsx';
import { formatRelativeTime } from '../../lib/formatting.ts';
import { PostStatus } from './PostStatus.tsx';

function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

export function VideoCard({ video }: { video: VideoView }) {
  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row" data-testid="video-card">
      <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:h-auto sm:w-40">
        {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" className="size-full object-cover" /> : <Film className="absolute inset-0 m-auto size-8 text-muted-foreground" aria-hidden />}
        <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white tabular-nums">{formatDuration(video.durationSeconds)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{video.title}</h2>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(video.createdAt)}</span>
        </div>
        {video.caption && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{video.caption}</p>}
        <ul className="mt-2 divide-y divide-border">
          {video.posts.length === 0 ? <li className="py-2 text-sm text-muted-foreground">No platforms are turned on. Turn some on in Platforms.</li> : video.posts.map((post) => <PostStatus key={post.publishJobId} post={post} />)}
        </ul>
      </div>
    </Card>
  );
}
