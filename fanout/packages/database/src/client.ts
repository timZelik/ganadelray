import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.ts';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  database: Database;
  close(): Promise<void>;
}

export const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export function createDatabase(databaseUrl: string, maximumConnections = 10): DatabaseHandle {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: maximumConnections });
  const database = drizzle({ client: pool, schema, casing: 'snake_case' });
  return { database, close: () => pool.end() };
}

export async function runMigrations(database: Database): Promise<void> {
  await migrate(database, { migrationsFolder });
}
