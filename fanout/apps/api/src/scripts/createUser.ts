import { parseArgs } from 'node:util';
import { loadEnvironment } from '@fanout/config';
import { createDatabase } from '@fanout/database';
import { createAuthentication } from '../authentication/authentication.ts';

/**
 * Creates a login (or resets its password). The password comes from FANOUT_NEW_PASSWORD so it never shows in the process list:
 *   FANOUT_NEW_PASSWORD='...' node apps/api/src/scripts/createUser.ts --email gana@example.com --name Gana
 */
const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
const password = process.env.FANOUT_NEW_PASSWORD;
if (!values.email || !password) {
  console.error('Usage: FANOUT_NEW_PASSWORD=<password> createUser.ts --email <email> --name <name>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('The password must be at least 8 characters.');
  process.exit(1);
}

const environment = loadEnvironment();
const { database, close } = createDatabase(environment.DATABASE_URL, 1);
const authentication = createAuthentication({ database, secret: environment.AUTH_SECRET, publicUrl: environment.PUBLIC_URL });
const outcome = await authentication.upsertAccount({ email: values.email, name: values.name ?? values.email.split('@')[0]!, password });
await close();
console.log(outcome === 'created' ? `Created login for ${values.email}` : `Reset the password for ${values.email}`);
