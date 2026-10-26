import { loadEnvironment } from '@fanout/config';
import { createDatabase, runMigrations } from '../client.ts';

const environment = loadEnvironment();
const { database, close } = createDatabase(environment.DATABASE_URL, 1);
await runMigrations(database);
await close();
console.log('Migrations applied');
