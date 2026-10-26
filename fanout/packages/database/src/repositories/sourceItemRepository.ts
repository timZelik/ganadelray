import { and, desc, eq } from 'drizzle-orm';
import type { MediaMetadata, SourceItem } from '@fanout/domain';
import type { Database } from '../client.ts';
import { toSourceItem } from '../mappers.ts';
import { sourceItems } from '../schema.ts';

export type NewSourceItem = Omit<SourceItem, 'id' | 'masterMetadata'> & { masterMetadata: MediaMetadata };

export function createSourceItemRepository(database: Database) {
  return {
    /** Idempotent: a re-detected item returns the row that already exists. */
    async insertIfAbsent(sourceItem: NewSourceItem): Promise<{ sourceItem: SourceItem; created: boolean }> {
      const [inserted] = await database.insert(sourceItems).values(sourceItem).onConflictDoNothing().returning();
      if (inserted) return { sourceItem: toSourceItem(inserted), created: true };
      const existing = await this.findByExternalId(sourceItem.sourceConnectionId, sourceItem.externalId);
      return { sourceItem: existing!, created: false };
    },
    async findById(sourceItemId: string): Promise<SourceItem | null> {
      const row = await database.query.sourceItems.findFirst({ where: eq(sourceItems.id, sourceItemId) });
      return row ? toSourceItem(row) : null;
    },
    async listRecent(limit: number): Promise<SourceItem[]> {
      const rows = await database.select().from(sourceItems).orderBy(desc(sourceItems.createdAt)).limit(limit);
      return rows.map(toSourceItem);
    },
    async findByExternalId(sourceConnectionId: string, externalId: string): Promise<SourceItem | null> {
      const row = await database.query.sourceItems.findFirst({ where: and(eq(sourceItems.sourceConnectionId, sourceConnectionId), eq(sourceItems.externalId, externalId)) });
      return row ? toSourceItem(row) : null;
    },
  };
}

export type SourceItemRepository = ReturnType<typeof createSourceItemRepository>;
