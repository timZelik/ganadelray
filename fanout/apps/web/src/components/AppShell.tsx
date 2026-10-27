import { bullBoardBasePath } from '@fanout/api-contract';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet } from '@tanstack/react-router';
import { LogOut, Send } from 'lucide-react';
import { sessionQuery, useSignOut } from '../features/session/sessionQueries.ts';
import { Button } from './ui/button.tsx';

const navigationLinks = [
  { to: '/', label: 'Videos' },
  { to: '/platforms', label: 'Platforms' },
] as const;

export function AppShell() {
  const { data: session } = useQuery(sessionQuery);
  const signOut = useSignOut();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 font-semibold"><Send className="size-5" aria-hidden /> Fanout</Link>
            <nav className="flex gap-1">
              {navigationLinks.map((link) => (
                <Link key={link.to} to={link.to} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted" activeProps={{ className: 'bg-muted font-medium text-foreground' }} activeOptions={{ exact: true }}>
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{session?.user.name}</span>
            <Button variant="ghost" onClick={() => signOut.mutate()} aria-label="Log out"><LogOut className="size-4" aria-hidden /><span className="hidden sm:inline">Log out</span></Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8"><Outlet /></main>
      <footer className="mx-auto flex w-full max-w-4xl gap-4 px-4 py-6 text-xs text-muted-foreground">
        <Link to="/activity" className="hover:underline">Activity log</Link>
        <a href={bullBoardBasePath} className="hover:underline">Queues (advanced)</a>
      </footer>
    </div>
  );
}
