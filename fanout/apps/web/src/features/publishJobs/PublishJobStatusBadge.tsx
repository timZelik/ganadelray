import type { PublishJobStatus } from '@fanout/api-contract';
import { Badge, type BadgeTone } from '../../components/ui/badge.tsx';

const statusTones: Record<PublishJobStatus, BadgeTone> = {
  queued: 'neutral', preparing: 'info', publishing: 'info', processing: 'info', published: 'success', failed: 'danger', skipped: 'warning',
};

export function PublishJobStatusBadge({ status, dryRun }: { status: PublishJobStatus; dryRun: boolean }) {
  const isInFlight = statusTones[status] === 'info';
  return (
    <Badge tone={statusTones[status]} data-testid="job-status">
      {isInFlight && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {status === 'published' && dryRun ? 'dry run ✓' : status}
    </Badge>
  );
}
