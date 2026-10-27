import { apiRoutes, toFriendlyPostState, type PostView, type VideoView } from '@fanout/api-contract';
import type { PublishJobSummary } from '@fanout/database';
import { isRetryable, type SourceItem } from '@fanout/domain';
import { toFriendlyProblem } from '../friendlyProblems.ts';

function presentPost(job: PublishJobSummary): PostView {
  return {
    publishJobId: job.id,
    destinationKind: job.destinationKind,
    state: toFriendlyPostState(job.status, job.dryRun),
    problem: job.status === 'published' ? null : toFriendlyProblem(job.lastError),
    postUrl: job.externalPostUrl,
    canRetry: isRetryable(job.status),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function presentVideo(sourceItem: SourceItem & { createdAt?: Date }, jobs: PublishJobSummary[]): VideoView {
  return {
    id: sourceItem.id,
    title: sourceItem.title?.trim() || 'Untitled video',
    caption: sourceItem.originalCaption,
    durationSeconds: Math.round(sourceItem.durationSeconds * 10) / 10,
    createdAt: (sourceItem.createdAt ?? sourceItem.detectedAt).toISOString(),
    thumbnailUrl: sourceItem.thumbnailStorageKey ? apiRoutes.videoThumbnail(sourceItem.id) : null,
    posts: jobs.filter((job) => job.sourceItemId === sourceItem.id).map(presentPost),
  };
}
