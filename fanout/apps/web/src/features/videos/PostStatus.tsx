import type { PostView } from '@fanout/api-contract';
import { CheckCircle2, Clock, ExternalLink, FlaskConical, Loader2, RotateCcw, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { PlatformBadge } from '../../components/PlatformBadge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { useRetryPost } from './videoQueries.ts';

const stateDisplay: Record<PostView['state'], { icon: ReactNode; label: string; className: string }> = {
  waiting: { icon: <Clock className="size-4" aria-hidden />, label: 'Waiting', className: 'text-muted-foreground' },
  working: { icon: <Loader2 className="size-4 animate-spin" aria-hidden />, label: 'Posting…', className: 'text-info' },
  posted: { icon: <CheckCircle2 className="size-4" aria-hidden />, label: 'Posted', className: 'text-success' },
  practice: { icon: <FlaskConical className="size-4" aria-hidden />, label: 'Practice: not posted', className: 'text-warning' },
  failed: { icon: <XCircle className="size-4" aria-hidden />, label: "Couldn't post", className: 'text-danger' },
};

/** One platform's line on a video card: what happened, in plain words, and the one thing you can do about it. */
export function PostStatus({ post }: { post: PostView }) {
  const retry = useRetryPost();
  const display = stateDisplay[post.state];
  return (
    <li className="space-y-1 py-2" data-testid="post-status" data-state={post.state} data-platform={post.destinationKind}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PlatformBadge destinationKind={post.destinationKind} size="small" />
        <span className="flex items-center gap-3">
          <span className={`flex items-center gap-1.5 text-sm font-medium ${display.className}`}>{display.icon}{display.label}</span>
          {post.postUrl && <a href={post.postUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm underline">View <ExternalLink className="size-3.5" aria-hidden /></a>}
          {post.canRetry && (
            <Button onClick={() => retry.mutate(post.publishJobId)} disabled={retry.isPending} aria-label={`Try ${post.destinationKind} again`}>
              <RotateCcw className="size-3.5" aria-hidden /> Try again
            </Button>
          )}
        </span>
      </div>
      {post.problem && <p className="pl-7 text-sm text-danger" data-testid="post-problem">{post.problem}</p>}
    </li>
  );
}
