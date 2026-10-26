import type { PublishJobStatus } from '@fanout/api-contract';
import { Inbox } from 'lucide-react';
import { useState } from 'react';
import { Table, TableHeaderCell } from '../../components/ui/table.tsx';
import { PublishJobRow } from './PublishJobRow.tsx';
import { usePublishJobs } from './publishJobQueries.ts';
import { StatusFilter } from './StatusFilter.tsx';

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground" data-testid="empty-state">
      <Inbox className="size-8" aria-hidden />
      <p className="font-medium text-foreground">No publish jobs yet</p>
      <p className="text-sm">Drop a video into the hub folder and it will appear here within a few seconds.</p>
    </div>
  );
}

export function PublishJobsPage() {
  const [status, setStatus] = useState<PublishJobStatus | undefined>(undefined);
  const { data, error, isPending } = usePublishJobs(status);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Activity log</h1>
          <p className="text-sm text-muted-foreground">Every post attempt, with technical details. Refreshes every few seconds.</p>
        </div>
        <StatusFilter selected={status} onSelect={setStatus} />
      </div>
      {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">Could not load jobs: {error.message}</p>}
      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && data.jobs.length === 0 && <EmptyState />}
      {data && data.jobs.length > 0 && (
        <Table>
          <thead>
            <tr>
              {['Source', 'Destination', 'Route', 'Status', 'Updated', ''].map((heading) => <TableHeaderCell key={heading}>{heading}</TableHeaderCell>)}
            </tr>
          </thead>
          <tbody>{data.jobs.map((job) => <PublishJobRow key={job.id} job={job} />)}</tbody>
        </Table>
      )}
    </section>
  );
}
