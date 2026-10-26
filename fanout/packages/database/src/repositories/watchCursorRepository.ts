import { eq } from 'drizzle-orm';
import type { Database } from '../client.ts';
import { watchCursors } from '../schema.ts';

export function createWatchCursorRepository(database: Database) {
  return {
    async find(connectionId: string): Promise<unknown> {
      const row = await database.query.watchCursors.findFirst({ where: eq(watchCursors.connectionId, connectionId) });
      return row?.cursor ?? null;
    },
    async save(connectionId: string, cursor: unknown): Promise<void> {
      await database
        .insert(watchCursors)
        .values({ connectionId, cursor, updatedAt: new Date() })
        .onConflictDoUpdate({ target: watchCursors.connectionId, set: { cursor, updatedAt: new Date() } });
    },
  };
}

export type WatchCursorRepository = ReturnType<typeof createWatchCursorRepository>;
