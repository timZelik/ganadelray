import type { PublishJobStatus } from '@fanout/domain';

/** What a post means to the person using the app, as opposed to the pipeline's internal status. */
export const friendlyPostStates = ['waiting', 'working', 'posted', 'practice', 'failed'] as const;
export type FriendlyPostState = (typeof friendlyPostStates)[number];

const friendlyStateByStatus: Record<PublishJobStatus, FriendlyPostState> = {
  queued: 'waiting',
  preparing: 'working',
  publishing: 'working',
  processing: 'working',
  published: 'posted',
  failed: 'failed',
  skipped: 'failed',
};

/** A dry-run "publish" is shown as practice, so nobody ever believes something was posted when it was not. */
export function toFriendlyPostState(status: PublishJobStatus, dryRun: boolean): FriendlyPostState {
  const state = friendlyStateByStatus[status];
  return state === 'posted' && dryRun ? 'practice' : state;
}
