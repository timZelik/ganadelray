import { createDatabase, runMigrations, type DatabaseHandle } from '@fanout/database';
import { startPostgresContainer, type StartedPostgreSqlContainer } from '@fanout/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthentication, type Authentication } from '../src/authentication/authentication.ts';

const publicUrl = 'http://localhost:8080';
let container: StartedPostgreSqlContainer;
let handle: DatabaseHandle;
let authentication: Authentication;

function authRequest(path: string, body: object): Request {
  return new Request(`${publicUrl}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: publicUrl }, body: JSON.stringify(body) });
}

async function signIn(email: string, password: string): Promise<Response> {
  return authentication.handleAuthenticationRequest(authRequest('/sign-in/email', { email, password }));
}

function sessionCookieFrom(response: Response): Headers {
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
  return new Headers({ cookie: cookies });
}

beforeAll(async () => {
  container = await startPostgresContainer();
  handle = createDatabase(container.getConnectionUri());
  await runMigrations(handle.database);
  authentication = createAuthentication({ database: handle.database, secret: 'integration-test-secret-that-is-long-enough', publicUrl });
});

afterAll(async () => {
  await handle?.close();
  await container?.stop();
});

describe('better-auth on our schema', () => {
  it('creates an account that can sign in and holds a session', async () => {
    expect(await authentication.upsertAccount({ email: 'Gana@Example.com', name: 'Gana', password: 'first-password-1' })).toBe('created');
    const response = await signIn('gana@example.com', 'first-password-1');
    expect(response.status).toBe(200);
    expect(await authentication.findSessionUser(sessionCookieFrom(response))).toEqual({ id: expect.any(String), name: 'Gana', email: 'gana@example.com' });
  });

  it('rejects a wrong password and anonymous session checks', async () => {
    expect((await signIn('gana@example.com', 'not-the-password')).status).toBe(401);
    expect(await authentication.findSessionUser(new Headers())).toBeNull();
  });

  it('resets the password when the account already exists', async () => {
    expect(await authentication.upsertAccount({ email: 'gana@example.com', name: 'Gana', password: 'second-password-2' })).toBe('password_reset');
    expect((await signIn('gana@example.com', 'first-password-1')).status).toBe(401);
    expect((await signIn('gana@example.com', 'second-password-2')).status).toBe(200);
  });

  it('does not let strangers sign up', async () => {
    const response = await authentication.handleAuthenticationRequest(authRequest('/sign-up/email', { email: 'stranger@example.com', password: 'stranger-password', name: 'Stranger' }));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await signIn('stranger@example.com', 'stranger-password')).status).toBe(401);
  });
});
