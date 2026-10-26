import { loadEnvironment } from '@fanout/config';
import { createDatabase } from '../client.ts';
import { createRepositories } from '../repositories/index.ts';
import { ensureDefaultHubWorkflow } from '../seedDefaults.ts';
import { createTokenCipher } from '../tokenCipher.ts';

const environment = loadEnvironment();
const { database, close } = createDatabase(environment.DATABASE_URL, 1);
const { workflow, created } = await ensureDefaultHubWorkflow(createRepositories(database, createTokenCipher(environment.TOKEN_ENCRYPTION_KEY)), environment.HUB_DIRECTORY);
await close();
console.log(created ? `Seeded workflow "${workflow.name}"` : `Workflow "${workflow.name}" already exists`);
