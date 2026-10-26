import { bullBoardBasePath } from '@fanout/api-contract';
import { Outlet } from '@tanstack/react-router';
import { ExternalLink, Send } from 'lucide-react';
import { Badge } from './ui/badge.tsx';
import { useHealth } from '../features/publishJobs/publishJobQueries.ts';

export function AppShell() {
  const { data: health } = useHealth();
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Send className="size-5" aria-hidden />
            Fanout
            {health?.dryRun && <Badge tone="warning" data-testid="dry-run-badge">Dry run: nothing is posted</Badge>}
          </div>
          <a href={bullBoardBasePath} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            Queues <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
