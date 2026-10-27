import type { BufferChannelView, DestinationSettingsView, PlatformsResponse, UpdateDestinationRequest } from '@fanout/api-contract';
import { bufferServiceByDestination, type BufferAccountSummary } from '@fanout/connector-buffer';
import { uploadWorkflowName } from '@fanout/database';
import { PermanentError, type Connection, type FitMode, type Workflow, type WorkflowDestination } from '@fanout/domain';
import { validateCaptionTemplate } from '@fanout/captions';
import type { ApiDependencies } from '../dependencies.ts';

export const bufferAccountHandle = 'buffer';

interface StoredBufferSettings {
  organizationId: string;
  organizationName: string;
  channels: BufferChannelView[];
}

function toStoredSettings(account: BufferAccountSummary): StoredBufferSettings {
  return {
    organizationId: account.organizationId,
    organizationName: account.organizationName,
    channels: account.channels.filter((channel) => !channel.isLocked).map((channel) => ({ id: channel.id, name: channel.displayName ?? channel.name, service: channel.service, avatar: channel.avatar ?? null })),
  };
}

function storedChannels(connection: Connection | null): BufferChannelView[] {
  return ((connection?.settings as Partial<StoredBufferSettings> | undefined)?.channels ?? []) as BufferChannelView[];
}

async function findUploadWorkflow({ workflowRepository }: ApiDependencies): Promise<Workflow> {
  const workflow = (await workflowRepository.listAll()).find((candidate) => candidate.name === uploadWorkflowName);
  if (!workflow) throw new Error('The upload workflow is missing; run the migrate step to seed it');
  return workflow;
}

const findBufferConnection = ({ connectionRepository }: ApiDependencies) => connectionRepository.findByPlatformAndHandle('buffer', bufferAccountHandle);

function channelIdOf(destination: WorkflowDestination): string | null {
  return typeof destination.publisherSettings.channelId === 'string' ? destination.publisherSettings.channelId : null;
}

function presentDestination(destination: WorkflowDestination, dryRun: boolean, channels: BufferChannelView[]): DestinationSettingsView {
  const isLive = destination.publisherRoute === 'buffer' && channelIdOf(destination) !== null && !dryRun;
  return {
    id: destination.id,
    destinationKind: destination.destinationKind,
    enabled: destination.enabled,
    channelId: destination.publisherRoute === 'buffer' ? channelIdOf(destination) : null,
    captionTemplate: destination.captionTemplate,
    hashtags: destination.hashtags,
    channelOptions: channels.filter((channel) => channel.service === bufferServiceByDestination[destination.destinationKind]),
    mode: isLive ? 'live' : 'practice',
  };
}

export async function readPlatformSettings(dependencies: ApiDependencies): Promise<PlatformsResponse> {
  const [workflow, bufferConnection] = await Promise.all([findUploadWorkflow(dependencies), findBufferConnection(dependencies)]);
  return {
    buffer: {
      connected: bufferConnection !== null,
      needsReconnect: bufferConnection !== null && bufferConnection.status !== 'active',
      organizationName: (bufferConnection?.settings.organizationName as string | undefined) ?? null,
      channels: storedChannels(bufferConnection),
    },
    livePostingEnabled: !dependencies.dryRun,
    fitMode: workflow.fitMode,
    destinations: workflow.destinations.map((destination) => presentDestination(destination, dependencies.dryRun, storedChannels(bufferConnection))),
  };
}

function routeToChannel(connectionId: string, channelId: string) {
  return { publisherRoute: 'buffer' as const, connectionId, publisherSettings: { channelId } };
}

const practiceRoute = { publisherRoute: 'console' as const, connectionId: null, publisherSettings: {} };

/** Validates the key with Buffer, stores it encrypted, and points every platform without an account at its matching Buffer channel. */
export async function connectBuffer(dependencies: ApiDependencies, apiKey: string): Promise<PlatformsResponse> {
  const settings = toStoredSettings(await dependencies.fetchBufferAccount(apiKey));
  const tokenSet = { accessToken: apiKey, refreshToken: null, expiresAt: null, tokenType: 'Bearer' };
  const existing = await findBufferConnection(dependencies);
  const connectionId = existing
    ? (await dependencies.connectionRepository.replaceCredentials(existing.id, tokenSet, { ...settings }), existing.id)
    : (await dependencies.connectionRepository.create({ platform: 'buffer', accountHandle: bufferAccountHandle, tokenSet, settings: { ...settings } })).id;
  const workflow = await findUploadWorkflow(dependencies);
  for (const destination of workflow.destinations.filter((candidate) => candidate.publisherRoute !== 'buffer')) {
    const matchingChannel = settings.channels.find((channel) => channel.service === bufferServiceByDestination[destination.destinationKind]);
    if (matchingChannel) await dependencies.workflowRepository.updateDestination(destination.id, routeToChannel(connectionId, matchingChannel.id));
  }
  return readPlatformSettings(dependencies);
}

/** Puts every platform back into practice mode, then forgets the key. */
export async function disconnectBuffer(dependencies: ApiDependencies): Promise<PlatformsResponse> {
  const connection = await findBufferConnection(dependencies);
  if (connection) {
    const workflow = await findUploadWorkflow(dependencies);
    for (const destination of workflow.destinations.filter((candidate) => candidate.connectionId === connection.id)) {
      await dependencies.workflowRepository.updateDestination(destination.id, practiceRoute);
    }
    await dependencies.connectionRepository.delete(connection.id);
  }
  return readPlatformSettings(dependencies);
}

function normalizedHashtags(hashtags: string[]): string[] {
  return hashtags.map((tag) => tag.trim().replace(/^#+/, '')).filter((tag) => tag !== '');
}

export async function updateDestinationSettings(dependencies: ApiDependencies, destinationId: string, request: UpdateDestinationRequest): Promise<PlatformsResponse> {
  const workflow = await findUploadWorkflow(dependencies);
  if (!workflow.destinations.some((destination) => destination.id === destinationId)) throw new PermanentError('Unknown platform');
  if (request.captionTemplate !== undefined) {
    const validation = validateCaptionTemplate(request.captionTemplate);
    if (!validation.valid) throw new PermanentError(validation.problems.join(' '));
  }
  const routeChanges = await resolveRouteChange(dependencies, request.channelId);
  await dependencies.workflowRepository.updateDestination(destinationId, {
    ...(request.enabled !== undefined ? { enabled: request.enabled } : {}),
    ...(request.captionTemplate !== undefined ? { captionTemplate: request.captionTemplate } : {}),
    ...(request.hashtags !== undefined ? { hashtags: normalizedHashtags(request.hashtags) } : {}),
    ...routeChanges,
  });
  return readPlatformSettings(dependencies);
}

async function resolveRouteChange(dependencies: ApiDependencies, channelId: string | null | undefined) {
  if (channelId === undefined) return {};
  if (channelId === null) return practiceRoute;
  const connection = await findBufferConnection(dependencies);
  if (!connection || !storedChannels(connection).some((channel) => channel.id === channelId)) throw new PermanentError('That Buffer account is not connected');
  return routeToChannel(connection.id, channelId);
}

export async function updateFitMode(dependencies: ApiDependencies, fitMode: FitMode): Promise<PlatformsResponse> {
  await dependencies.workflowRepository.updateFitMode((await findUploadWorkflow(dependencies)).id, fitMode);
  return readPlatformSettings(dependencies);
}
