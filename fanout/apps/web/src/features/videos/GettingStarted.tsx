import { Link } from '@tanstack/react-router';
import { CheckCircle2, Circle } from 'lucide-react';
import { Card } from '../../components/ui/card.tsx';

interface GettingStartedProps {
  bufferConnected: boolean;
  hasLivePlatform: boolean;
  hasVideos: boolean;
}

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      {done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="To do" />}
      <span className={done ? 'text-muted-foreground line-through' : ''}>{children}</span>
    </li>
  );
}

/** Shown until setup is complete: three steps, each saying exactly where to click. */
export function GettingStarted({ bufferConnected, hasLivePlatform, hasVideos }: GettingStartedProps) {
  if (bufferConnected && hasLivePlatform && hasVideos) return null;
  return (
    <Card className="p-5" data-testid="getting-started">
      <h2 className="mb-3 font-semibold">Getting started</h2>
      <ol className="space-y-2 text-sm">
        <Step done={bufferConnected}>Connect Buffer on the <Link to="/platforms" className="font-medium underline">Platforms</Link> page. Buffer holds your TikTok, Instagram, YouTube and LinkedIn logins.</Step>
        <Step done={hasLivePlatform}>Turn on the platforms you want and check each caption style.</Step>
        <Step done={hasVideos}>Upload a video below. You can do this first to see what Fanout would post.</Step>
      </ol>
    </Card>
  );
}
