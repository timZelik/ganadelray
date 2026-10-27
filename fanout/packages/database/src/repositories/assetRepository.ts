import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import type { Asset } from '@fanout/domain';
import type { Database } from '../client.ts';
import { toAsset } from '../mappers.ts';
import { assets } from '../schema.ts';

export type NewAsset = Omit<Asset, 'id' | 'createdAt' | 'deletedAt'>;

const isLiveAt = (now: Date) => and(isNull(assets.deletedAt), gt(assets.expiresAt, now));

export function createAssetRepository(database: Database) {
  return {
    async findLiveForDestination(sourceItemId: string, workflowDestinationId: string, now: Date): Promise<Asset | null> {
      const row = await database.query.assets.findFirst({ where: and(eq(assets.sourceItemId, sourceItemId), eq(assets.workflowDestinationId, workflowDestinationId), isLiveAt(now)) });
      return row ? toAsset(row) : null;
    },
    /** Another destination with an identical profile already rendered this: reuse its file. */
    async findLiveByFingerprint(sourceItemId: string, renderFingerprint: string, now: Date): Promise<Asset | null> {
      const row = await database.query.assets.findFirst({ where: and(eq(assets.sourceItemId, sourceItemId), eq(assets.renderFingerprint, renderFingerprint), isLiveAt(now)) });
      return row ? toAsset(row) : null;
    },
    async upsertForDestination(asset: NewAsset): Promise<Asset> {
      const [row] = await database
        .insert(assets)
        .values(asset)
        .onConflictDoUpdate({ target: [assets.sourceItemId, assets.workflowDestinationId], set: { ...asset, deletedAt: null, createdAt: new Date() } })
        .returning();
      return toAsset(row!);
    },
    async listExpired(now: Date, limit: number): Promise<Asset[]> {
      const rows = await database.select().from(assets).where(and(isNull(assets.deletedAt), lte(assets.expiresAt, now))).limit(limit);
      return rows.map(toAsset);
    },
    async markDeleted(assetIds: string[], now: Date): Promise<void> {
      if (assetIds.length > 0) await database.update(assets).set({ deletedAt: now }).where(inArray(assets.id, assetIds));
    },
    /** Renditions are shared between destinations, so a file is deleted only when no live asset still points at it. */
    async isStorageKeyReferenced(storageKey: string, now: Date): Promise<boolean> {
      const row = await database.query.assets.findFirst({ columns: { id: true }, where: and(eq(assets.storageKey, storageKey), isLiveAt(now)) });
      return row !== undefined;
    },
  };
}

export type AssetRepository = ReturnType<typeof createAssetRepository>;
