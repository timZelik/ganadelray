import { loadEnvironment } from '@fanout/config';
import { createDatabase, runMigrations } from '../client.ts';
import { createRepositories } from '../repositories/index.ts';
import { seedDefaults } from '../seedDefaults.ts';
import { createTokenCipher } from '../tokenCipher.ts';

const environment = loadEnvironment();
const { database, close } = createDatabase(environment.DATABASE_URL, 1);
await runMigrations(database);
await seedDefaults(createRepositories(database, createTokenCipher(environment.TOKEN_ENCRYPTION_KEY)), { hubDirectory: environment.ENABLE_HUB_FOLDER ? environment.HUB_DIRECTORY : null });
await close();
console.log('Migrations applied and defaults seeded');
