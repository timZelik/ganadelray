import type { Connection, Workflow } from '@fanout/domain';
import type { Repositories } from './repositories/index.ts';
import type { NewWorkflowDestination } from './repositories/workflowRepository.ts';

export const defaultHubAccountHandle = 'hub';
export const defaultWorkflowName = 'Hub → Reels, TikTok, Shorts, LinkedIn (dry run)';

/** Phase 0's four destination profiles, all routed to the ConsolePublisher until real publishers exist. */
export const defaultDestinations: NewWorkflowDestination[] = [
  { destinationKind: 'instagram_reels', publisherRoute: 'console', captionTemplate: '{{originalCaption}}\n\n{{hashtags}}', hashtags: ['reels', 'creator'] },
  { destinationKind: 'tiktok', publisherRoute: 'console', captionTemplate: '{{originalCaption}} {{hashtags}}', hashtags: ['fyp', 'creator'] },
  { destinationKind: 'youtube_shorts', publisherRoute: 'console', captionTemplate: '{{originalCaption}}\n\n{{hashtags}}', hashtags: ['shorts'] },
  { destinationKind: 'linkedin', publisherRoute: 'console', captionTemplate: '{{originalCaption}}', hashtags: [] },
];

export interface SeedResult {
  hubConnection: Connection;
  workflow: Workflow;
  created: boolean;
}

/** Idempotent: safe to run on every `docker compose up`. */
export async function ensureDefaultHubWorkflow(repositories: Repositories, hubDirectory: string): Promise<SeedResult> {
  const { connectionRepository, workflowRepository } = repositories;
  const existingConnection = await connectionRepository.findByPlatformAndHandle('local_folder', defaultHubAccountHandle);
  const hubConnection = existingConnection ?? (await connectionRepository.create({ platform: 'local_folder', accountHandle: defaultHubAccountHandle, settings: { directory: hubDirectory } }));
  const existingWorkflow = (await workflowRepository.listEnabledForSource(hubConnection.id)).find((workflow) => workflow.name === defaultWorkflowName);
  if (existingWorkflow) return { hubConnection, workflow: existingWorkflow, created: false };
  const workflow = await workflowRepository.create({ name: defaultWorkflowName, sourceConnectionId: hubConnection.id, mode: 'auto_new', fitMode: 'pad', destinations: defaultDestinations });
  return { hubConnection, workflow, created: true };
}
