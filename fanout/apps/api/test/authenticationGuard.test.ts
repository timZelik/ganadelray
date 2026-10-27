import { apiRoutes } from '@fanout/api-contract';
import { describe, expect, it } from 'vitest';
import { buildApiServer } from '../src/server.ts';
import { buildFakeApiDependencies, signedIn } from './fakeApiDependencies.ts';

describe('login protection', () => {
  it('rejects anonymous API calls with 401 and lets signed-in ones through', async () => {
    const server = await buildApiServer(buildFakeApiDependencies().dependencies);
    expect((await server.inject({ method: 'GET', url: apiRoutes.videos })).statusCode).toBe(401);
    expect((await server.inject({ method: 'GET', url: apiRoutes.videos, headers: signedIn })).statusCode).toBe(200);
  });

  it('sends anonymous visitors of the queue dashboard to the login page', async () => {
    const server = await buildApiServer({ ...buildFakeApiDependencies().dependencies });
    const response = await server.inject({ method: 'GET', url: '/admin/queues' });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/login?next=%2Fadmin%2Fqueues');
  });

  it('keeps health and the login endpoints public, forwarding cookies from the login service', async () => {
    const server = await buildApiServer(buildFakeApiDependencies().dependencies);
    expect((await server.inject({ method: 'GET', url: apiRoutes.health })).statusCode).toBe(200);
    const login = await server.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email: 'gana@example.com', password: 'secret-password' } });
    expect(login.statusCode).toBe(200);
    expect(login.headers['set-cookie']).toContain('fanout-test-session=valid');
  });

  it('tells the dashboard who is logged in', async () => {
    const server = await buildApiServer(buildFakeApiDependencies().dependencies);
    expect((await server.inject({ method: 'GET', url: apiRoutes.session, headers: signedIn })).json()).toEqual({ user: { name: 'Gana', email: 'gana@example.com' } });
  });
});
