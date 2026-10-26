import type { PublishJobView } from '@fanout/api-contract';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { TableCell, TableRow } from '../../components/ui/table.tsx';
import { destinationLabels, formatRelativeTime, routeLabels } from '../../lib/formatting.ts';
import { PublishJobDetails } from './PublishJobDetails.tsx';
import { PublishJobStatusBadge } from './PublishJobStatusBadge.tsx';
import { useRetryPublishJob } from './publishJobQueries.ts';

const columnCount = 6;

export function PublishJobRow({ job }: { job: PublishJobView }) {
  const [isExpanded, setExpanded] = useState(false);
  const retry = useRetryPublishJob();
  const ExpandIcon = isExpanded ? ChevronDown : ChevronRight;
  return (
    <>
      <TableRow data-testid="publish-job-row" data-job-id={job.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setExpanded(!isExpanded)}>
        <TableCell className="font-medium">
          <span className="flex items-center gap-1.5">
            <ExpandIcon className="size-4 text-muted-foreground" aria-hidden />
            {job.sourceItemTitle ?? job.sourceItemExternalId}
          </span>
        </TableCell>
        <TableCell>{destinationLabels[job.destinationKind]}</TableCell>
        <TableCell className="text-muted-foreground">{routeLabels[job.publisherRoute]}</TableCell>
        <TableCell><PublishJobStatusBadge status={job.status} dryRun={job.dryRun} /></TableCell>
        <TableCell className="text-muted-foreground tabular-nums" title={job.updatedAt}>
          {formatRelativeTime(job.updatedAt)} · {job.attemptCount} {job.attemptCount === 1 ? 'attempt' : 'attempts'}
        </TableCell>
        <TableCell className="text-right">
          {job.canRetry && (
            <Button onClick={(event) => (event.stopPropagation(), retry.mutate(job.id))} disabled={retry.isPending} aria-label={`Retry ${destinationLabels[job.destinationKind]}`}>
              <RotateCcw className="size-3.5" aria-hidden />
              {retry.isPending ? 'Retrying…' : 'Retry'}
            </Button>
          )}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={columnCount}><PublishJobDetails job={job} /></TableCell>
        </TableRow>
      )}
    </>
  );
}
