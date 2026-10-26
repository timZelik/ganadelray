import { planPublishJobs } from '@fanout/domain';
import { buildMediaMetadata, startPostgresContainer, testEncryptionKey, type StartedPostgreSqlContainer } from '@fanout/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, createRepositories, createTokenCipher, ensureDefaultHubWorkflow, runMigrations, type DatabaseHandle, type Repositories } from '../src/index.ts';

let container: StartedPostgreSqlContainer;
let handle: DatabaseHandle;
let repositories: Repositories;

beforeAll(async () => {
  container = await startPostgresContainer();
  handle = createDatabase(container.getConnectionUri());
  await runMigrations(handle.database);
  repositories = createRepositories(handle.database, createTokenCipher(testEncryptionKey));
});

afterAll(async () => {
  await handle?.close();
  await container?.stop();
});

async function seedSourceItem(externalId: string) {
  const { hubConnection, workflow } = await ensureDefaultHubWorkflow(repositories, '/hub');
  const { sourceItem } = await repositories.sourceItemRepository.insertIfAbsent({
    sourceConnectionId: hubConnection.id, externalId, detectedAt: new Date(), title: 'Clip', originalCaption: 'Caption',
    durationSeconds: 12, masterStorageKey: `masters/${externalId}.mp4`, masterChecksum: `checksum-${externalId}`, masterMetadata: buildMediaMetadata(),
  });
  return { hubConnection, workflow, sourceItem };
}

describe('seed', () => {
  it('creates the hub connection and a four-destination workflow exactly once', async () => {
    const first = await ensureDefaultHubWorkflow(repositories, '/hub');
    const second = await ensureDefaultHubWorkflow(repositories, '/hub');
    expect(second.created).toBe(false);
    expect(second.workflow.id).toBe(first.workflow.id);
    expect(first.workflow.destinations.map((destination) => destination.destinationKind)).toEqual(['instagram_reels', 'tiktok', 'youtube_shorts', 'linkedin']);
  });
});

describe('connection repository', () => {
  it('stores tokens only as ciphertext', async () => {
    const connection = await repositories.connectionRepository.create({ platform: 'instagram', accountHandle: '@me', tokenSet: { accessToken: 'plain-access-token', refreshToken: null, expiresAt: null, tokenType: 'Bearer' } });
    const { rows } = await handle.database.execute(sql`select encrypted_token_set from connections where id = ${connection.id}`);
    expect(String(rows[0]!.encrypted_token_set)).not.toContain('plain-access-token');
    expect((await repositories.connectionRepository.findById(connection.id))!.tokenSet!.accessToken).toBe('plain-access-token');
  });
});

describe('source item repository', () => {
  it('inserts a detected item once and returns the existing row on re-detection', async () => {
    const first = await seedSourceItem('file-a');
    const again = await repositories.sourceItemRepository.insertIfAbsent({ ...first.sourceItem });
    expect(again).toEqual({ sourceItem: first.sourceItem, created: false });
  });
});

describe('publish job repository', () => {
  it('fans out idempotently: re-running returns the same jobs without duplicates', async () => {
    const { workflow, sourceItem } = await seedSourceItem('file-b');
    const planned = await planPublishJobs({ workflow, sourceItem, now: new Date(), dryRun: true });
    const first = await repositories.publishJobRepository.insertPlanned(planned);
    const second = await repositories.publishJobRepository.insertPlanned(planned);
    expect(first).toHaveLength(4);
    expect(second.map((job) => job.id).sort()).toEqual(first.map((job) => job.id).sort());
  });

  it('only lets one worker win a status transition', async () => {
    const { workflow, sourceItem } = await seedSourceItem('file-c');
    const [job] = await repositories.publishJobRepository.insertPlanned(await planPublishJobs({ workflow, sourceItem, now: new Date(), dryRun: true }));
    const winners = await Promise.all([1, 2, 3].map(() => repositories.publishJobRepository.transition(job!.id, 'preparing')));
    expect(winners.filter((winner) => winner !== null)).toHaveLength(1);
    expect(await repositories.publishJobRepository.transition(job!.id, 'published')).toBeNull();
    const publishing = await repositories.publishJobRepository.transition(job!.id, 'publishing', { incrementAttemptCount: true });
    expect(publishing!.attemptCount).toBe(1);
  });

  it('lists summaries with destination and source details, filterable by status', async () => {
    const summaries = await repositories.publishJobRepository.listSummaries({ limit: 50 });
    expect(summaries.length).toBeGreaterThanOrEqual(8);
    expect(summaries[0]).toMatchObject({ workflowName: expect.any(String), publisherRoute: 'console', sourceItemTitle: 'Clip' });
    const preparing = await repositories.publishJobRepository.listSummaries({ limit: 50, status: 'publishing' });
    expect(preparing.every((summary) => summary.status === 'publishing')).toBe(true);
  });
});

describe('asset repository', () => {
  it('reuses renders by fingerprint and only frees files no live asset references', async () => {
    const { workflow, sourceItem } = await seedSourceItem('file-d');
    const [reels, tiktok] = workflow.destinations;
    const now = new Date();
    const shared = { sourceItemId: sourceItem.id, storageKey: 'renditions/d/fingerprint.mp4', checksum: 'c', renderFingerprint: 'fingerprint', metadata: buildMediaMetadata() };
    await repositories.assetRepository.upsertForDestination({ ...shared, workflowDestinationId: reels!.id, expiresAt: new Date(now.getTime() - 1000) });
    await repositories.assetRepository.upsertForDestination({ ...shared, workflowDestinationId: tiktok!.id, expiresAt: new Date(now.getTime() + 60_000) });
    expect((await repositories.assetRepository.findLiveByFingerprint(sourceItem.id, 'fingerprint', now))!.workflowDestinationId).toBe(tiktok!.id);
    const expired = await repositories.assetRepository.listExpired(now, 10);
    expect(expired.map((asset) => asset.workflowDestinationId)).toContain(reels!.id);
    await repositories.assetRepository.markDeleted(expired.map((asset) => asset.id), now);
    expect(await repositories.assetRepository.isStorageKeyReferenced(shared.storageKey, now)).toBe(true);
    expect(await repositories.assetRepository.isStorageKeyReferenced(shared.storageKey, new Date(now.getTime() + 120_000))).toBe(false);
  });
});

describe('watch cursor and audit log repositories', () => {
  it('upserts cursors and records audit entries', async () => {
    const { hubConnection } = await seedSourceItem('file-e');
    await repositories.watchCursorRepository.save(hubConnection.id, { highWaterMark: 1 });
    await repositories.watchCursorRepository.save(hubConnection.id, { highWaterMark: 2 });
    expect(await repositories.watchCursorRepository.find(hubConnection.id)).toEqual({ highWaterMark: 2 });
    await repositories.auditLogRepository.record({ correlationId: 'c-1', connectionId: hubConnection.id, method: 'GET', endpoint: 'https://x.test', statusCode: 200, latencyMilliseconds: 12.7, redactedRequestBody: null, redactedResponseBody: { ok: true } });
    const { rows } = await handle.database.execute(sql`select latency_milliseconds from audit_logs where correlation_id = 'c-1'`);
    expect(rows[0]!.latency_milliseconds).toBe(13);
  });
});
