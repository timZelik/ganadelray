import type { PublishJobView } from '@fanout/api-contract';

/** Expanded row: the error to act on, and in dry-run mode the exact request that would have been sent. */
export function PublishJobDetails({ job }: { job: PublishJobView }) {
  return (
    <div className="space-y-3 text-sm">
      {job.lastError && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-danger" data-testid="job-error">
          <span className="font-medium">{job.lastErrorKind === 'permanent' ? 'Will not succeed as-is: ' : 'Last error: '}</span>
          {job.lastError}
        </p>
      )}
      {job.requestPreview !== null && job.requestPreview !== undefined && (
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{job.dryRun ? 'Request that would be sent' : 'Request sent'}</p>
          <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs" data-testid="request-preview">{JSON.stringify(job.requestPreview, null, 2)}</pre>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Job {job.id} · {job.workflowName} · source {job.sourceItemExternalId}
      </p>
    </div>
  );
}
