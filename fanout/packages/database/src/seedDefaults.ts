import type { Connection, Workflow } from '@fanout/domain';
import type { Repositories } from './repositories/index.ts';
import type { NewWorkflow, NewWorkflowDestination } from './repositories/workflowRepository.ts';

export const defaultHubAccountHandle = 'hub';
export const defaultWorkflowName = 'Hub → Reels, TikTok, Shorts, LinkedIn (dry run)';
export const uploadAccountHandle = 'browser';
export const uploadWorkflowName = 'My platforms';

/** The four platforms a new install starts with, all in practice mode until a Buffer channel is chosen. */
export const defaultDestinations: NewWorkflowDestination[] = [
  { destinationKind: 'instagram_reels', publisherRoute: 'console', captionTemplate: '{{originalCaption}}\n\n{{hashtags}}', hashtags: ['reels', 'creator'] },
  { destinationKind: 'tiktok', publisherRoute: 'console', captionTemplate: '{{originalCaption}} {{hashtags}}', hashtags: ['fyp', 'creator'] },
  { destinationKind: 'youtube_shorts', publisherRoute: 'console', captionTemplate: '{{originalCaption}}\n\n{{hashtags}}', hashtags: ['shorts'] },
  { destinationKind: 'linkedin', publisherRoute: 'console', captionTemplate: '{{originalCaption}}', hashtags: [] },
];

export interface SeedResult {
  sourceConnection: Connection;
  workflow: Workflow;
  created: boolean;
}

async function ensureSourceWorkflow(repositories: Repositories, source: { platform: 'local_folder' | 'upload'; accountHandle: string; settings: Record<string, unknown> }, workflow: Omit<NewWorkflow, 'sourceConnectionId'>): Promise<SeedResult> {
  const { connectionRepository, workflowRepository } = repositories;
  const sourceConnection = (await connectionRepository.findByPlatformAndHandle(source.platform, source.accountHandle)) ?? (await connectionRepository.create(source));
  const existing = (await workflowRepository.listAll()).find((candidate) => candidate.sourceConnectionId === sourceConnection.id && candidate.name === workflow.name);
  if (existing) return { sourceConnection, workflow: existing, created: false };
  return { sourceConnection, workflow: await workflowRepository.create({ ...workflow, sourceConnectionId: sourceConnection.id }), created: true };
}

/** Browser uploads → the user's platforms. Crop fills the vertical frame, which suits most phone-first content. */
export function ensureUploadWorkflow(repositories: Repositories): Promise<SeedResult> {
  return ensureSourceWorkflow(repositories, { platform: 'upload', accountHandle: uploadAccountHandle, settings: {} }, { name: uploadWorkflowName, mode: 'auto_new', fitMode: 'crop', destinations: defaultDestinations });
}

/** Developer workflow: videos dropped into the hub folder. Idempotent. */
export function ensureDefaultHubWorkflow(repositories: Repositories, hubDirectory: string): Promise<SeedResult> {
  return ensureSourceWorkflow(repositories, { platform: 'local_folder', accountHandle: defaultHubAccountHandle, settings: { directory: hubDirectory } }, { name: defaultWorkflowName, mode: 'auto_new', fitMode: 'pad', destinations: defaultDestinations });
}

export interface SeedOptions {
  hubDirectory: string | null;
}

/** Runs once per deploy, from the migrate step, so the API and worker never race to create the same rows. */
export async function seedDefaults(repositories: Repositories, { hubDirectory }: SeedOptions): Promise<void> {
  await ensureUploadWorkflow(repositories);
  if (hubDirectory) await ensureDefaultHubWorkflow(repositories, hubDirectory);
}
