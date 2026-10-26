import type { PublishJobSummary } from '@fanout/database';
import { statusesThatCanTransitionTo, type Connection, type SourceItem, type Workflow, type WorkflowDestination } from '@fanout/domain';
import type { IngestOutcome } from '@fanout/queue';
import { createInMemoryObjectStorage } from '@fanout/storage';
import { buildMediaMetadata, createSilentLogger } from '@fanout/testing';
import type { Authentication } from '../src/authentication/authentication.ts';
import type { ApiDependencies } from '../src/dependencies.ts';

export const now = new Date('2026-10-26T12:00:00Z');
export const sessionCookie = 'fanout-test-session=valid';
export const uploadConnectionId = '00000000-0000-4000-8000-0000000000aa';

let identifierCounter = 0;
export const nextIdentifier = () => `00000000-0000-4000-8000-${String(++identifierCounter).padStart(12, '0')}`;

export function buildSummary(overrides: Partial<PublishJobSummary> & Pick<PublishJobSummary, 'id' | 'status'>): PublishJobSummary {
  return {
    workflowId: 'w', sourceItemId: 's', workflowDestinationId: 'd', idempotencyKey: overrides.id, dryRun: true, attemptCount: 1, scheduledFor: now,
    externalPostId: null, externalPostUrl: null, lastError: null, lastErrorKind: null, requestPreview: { destination: 'tiktok' }, publishedAt: null,
    createdAt: now, updatedAt: now, workflowName: 'Hub', destinationKind: 'tiktok', publisherRoute: 'console', sourceItemTitle: 'Clip', sourceItemExternalId: 'clip.mp4',
    ...overrides,
  };
}

export function buildSourceItem(overrides: Partial<SourceItem> = {}): SourceItem {
  return {
    id: nextIdentifier(), sourceConnectionId: uploadConnectionId, externalId: 'upload-1', detectedAt: now, title: 'Studio tour', originalCaption: 'Inside the studio',
    durationSeconds: 8.04, masterStorageKey: 'masters/a.mp4', masterChecksum: 'abc', masterMetadata: buildMediaMetadata(), thumbnailStorageKey: 'thumbnails/abc.jpg', ...overrides,
  };
}

function buildUploadWorkflow(): Workflow {
  const destination = (destinationKind: WorkflowDestination['destinationKind']): WorkflowDestination => ({
    id: nextIdentifier(), workflowId: 'upload-workflow', destinationKind, publisherRoute: 'console', connectionId: null,
    captionTemplate: '{{originalCaption}}', hashtags: [], mediaProfileOverride: {}, publisherSettings: {}, enabled: true,
  });
  return {
    id: 'upload-workflow', name: 'My platforms', sourceConnectionId: uploadConnectionId, mode: 'auto_new', fitMode: 'crop', scheduleSlots: [], enabled: true,
    destinations: [destination('instagram_reels'), destination('tiktok'), destination('youtube_shorts'), destination('linkedin')], createdAt: now, updatedAt: now,
  };
}

/** A session exists exactly when the request carries the test cookie. */
const fakeAuthentication: Authentication = {
  handleAuthenticationRequest: async () => new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie } }),
  findSessionUser: async (headers) => (headers.get('cookie')?.includes(sessionCookie) ? { id: 'user-1', name: 'Gana', email: 'gana@example.com' } : null),
  upsertAccount: async () => 'created',
};

/** Stateful in-memory stand-ins for every dependency; transitions obey the same domain rules as the SQL compare-and-set. */
export function buildFakeApiDependencies(options: { dryRun?: boolean } = {}) {
  const summaries = new Map<string, PublishJobSummary>();
  const sourceItems: SourceItem[] = [];
  const workflow = buildUploadWorkflow();
  const connections = new Map<string, Connection>([[uploadConnectionId, { id: uploadConnectionId, platform: 'upload', accountHandle: 'browser', tokenSet: null, scopes: [], expiresAt: null, status: 'active', settings: {}, createdAt: now, updatedAt: now }]]);
  const enqueuedPrepares: Array<{ publishJobId: string; jobId?: string }> = [];
  const enqueuedIngests: Parameters<ApiDependencies['queues']['enqueueIngest']>[0][] = [];
  const ingestOutcomes = new Map<string, IngestOutcome>();
  const storage = createInMemoryObjectStorage();

  const dependencies: ApiDependencies = {
    logger: createSilentLogger(),
    dryRun: options.dryRun ?? false,
    publicUrl: 'http://localhost:8080',
    maximumUploadBytes: 5 * 1_048_576,
    now: () => now,
    storage,
    authentication: fakeAuthentication,
    fetchBufferAccount: async (apiKey) => {
      if (apiKey !== 'valid-buffer-key') {
        const { ReauthRequiredError } = await import('@fanout/domain');
        throw new ReauthRequiredError('Buffer: Invalid token');
      }
      return {
        organizationId: 'organization-1', organizationName: 'Gana Studio',
        channels: [
          { id: 'channel-tiktok', name: 'gana', displayName: 'Gana', service: 'tiktok', avatar: null, isLocked: false },
          { id: 'channel-instagram', name: 'gana.studio', displayName: null, service: 'instagram', avatar: null, isLocked: false },
        ],
      };
    },
    queues: {
      enqueuePrepare: async (publishJobId, prepareOptions) => void enqueuedPrepares.push({ publishJobId, ...(prepareOptions?.jobId ? { jobId: prepareOptions.jobId } : {}) }),
      enqueueIngest: async (payload) => void enqueuedIngests.push(payload),
      findIngestOutcome: async (_connectionId, externalId) => ingestOutcomes.get(externalId) ?? { state: 'unknown' },
    },
    publishJobRepository: {
      listSummaries: async ({ status }) => [...summaries.values()].filter((summary) => !status || summary.status === status),
      listSummariesForSourceItems: async (ids) => [...summaries.values()].filter((summary) => ids.includes(summary.sourceItemId)),
      findSummary: async (id) => summaries.get(id) ?? null,
      async transition(id, to, changes = {}) {
        const current = summaries.get(id);
        if (!current || !statusesThatCanTransitionTo(to).includes(current.status)) return null;
        const { incrementAttemptCount: _increment, ...columns } = changes;
        const updated = { ...current, ...columns, status: to } as PublishJobSummary;
        summaries.set(id, updated);
        return updated;
      },
    },
    sourceItemRepository: {
      listRecent: async (limit) => sourceItems.slice(0, limit),
      findById: async (id) => sourceItems.find((sourceItem) => sourceItem.id === id) ?? null,
    },
    workflowRepository: {
      listAll: async () => [structuredClone(workflow)],
      async updateDestination(destinationId, changes) {
        const index = workflow.destinations.findIndex((destination) => destination.id === destinationId);
        workflow.destinations[index] = { ...workflow.destinations[index]!, ...changes };
      },
      async updateFitMode(_workflowId, fitMode) {
        workflow.fitMode = fitMode;
      },
    },
    connectionRepository: {
      findByPlatformAndHandle: async (platform, handle) => [...connections.values()].find((connection) => connection.platform === platform && connection.accountHandle === handle) ?? null,
      async create(connection) {
        const created: Connection = { id: nextIdentifier(), tokenSet: connection.tokenSet ?? null, scopes: [], expiresAt: null, status: 'active', settings: connection.settings ?? {}, createdAt: now, updatedAt: now, platform: connection.platform, accountHandle: connection.accountHandle };
        connections.set(created.id, created);
        return created;
      },
      async replaceCredentials(id, tokenSet, settings) {
        connections.set(id, { ...connections.get(id)!, tokenSet, settings, status: 'active' });
      },
      async delete(id) {
        connections.delete(id);
      },
    },
  };
  return { dependencies, summaries, sourceItems, workflow, connections, enqueuedPrepares, enqueuedIngests, ingestOutcomes, storage };
}

export const signedIn = { cookie: sessionCookie };
