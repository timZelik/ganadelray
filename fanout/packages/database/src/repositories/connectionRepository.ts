import { eq } from 'drizzle-orm';
import type { Connection, ConnectionStatus, Platform, TokenSet } from '@fanout/domain';
import type { Database } from '../client.ts';
import { toConnection } from '../mappers.ts';
import { connections } from '../schema.ts';
import type { TokenCipher } from '../tokenCipher.ts';

export interface NewConnection {
  platform: Platform;
  accountHandle: string;
  tokenSet?: TokenSet | null;
  scopes?: string[];
  settings?: Record<string, unknown>;
}

/** Tokens are encrypted on the way in and decrypted on the way out; callers only ever see TokenSet objects. */
export function createConnectionRepository(database: Database, tokenCipher: TokenCipher) {
  const toEntity = (row: typeof connections.$inferSelect) => toConnection(row, tokenCipher);
  return {
    async create({ tokenSet = null, ...connection }: NewConnection): Promise<Connection> {
      const [row] = await database
        .insert(connections)
        .values({ ...connection, encryptedTokenSet: tokenSet ? tokenCipher.encrypt(tokenSet) : null, expiresAt: tokenSet?.expiresAt ?? null })
        .returning();
      return toEntity(row!);
    },
    async findById(connectionId: string): Promise<Connection | null> {
      const row = await database.query.connections.findFirst({ where: eq(connections.id, connectionId) });
      return row ? toEntity(row) : null;
    },
    async findByPlatformAndHandle(platform: Platform, accountHandle: string): Promise<Connection | null> {
      const row = await database.query.connections.findFirst({ where: (table, { and }) => and(eq(table.platform, platform), eq(table.accountHandle, accountHandle)) });
      return row ? toEntity(row) : null;
    },
    async listAll(): Promise<Connection[]> {
      return (await database.select().from(connections)).map(toEntity);
    },
    async updateStatus(connectionId: string, status: ConnectionStatus): Promise<void> {
      await database.update(connections).set({ status }).where(eq(connections.id, connectionId));
    },
  };
}

export type ConnectionRepository = ReturnType<typeof createConnectionRepository>;
