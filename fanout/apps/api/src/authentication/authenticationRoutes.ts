import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiServer } from '../server.ts';
import type { Authentication } from './authentication.ts';

import { authenticationBasePath } from '@fanout/api-contract';

export { authenticationBasePath };
const publicPaths = ['/api/health', `${authenticationBasePath}/`];

export function toFetchHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
}

function toFetchRequest(request: FastifyRequest, publicUrl: string): Request {
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body !== undefined;
  return new Request(new URL(request.url, publicUrl), {
    method: request.method,
    headers: toFetchHeaders(request),
    ...(hasBody ? { body: typeof request.body === 'string' ? request.body : JSON.stringify(request.body) } : {}),
  });
}

async function sendFetchResponse(reply: FastifyReply, response: Response): Promise<FastifyReply> {
  reply.status(response.status);
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') reply.header(name, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header('set-cookie', cookies);
  return reply.send(await response.text());
}

function requiresLogin(url: string): boolean {
  const path = url.split('?')[0]!;
  const isProtected = path.startsWith('/api/') || path.startsWith('/admin');
  return isProtected && !publicPaths.some((publicPath) => path === publicPath || path.startsWith(publicPath));
}

/** Mounts better-auth's endpoints and requires a session for everything else under /api and /admin. */
export function registerAuthentication(server: ApiServer, authentication: Authentication, publicUrl: string): void {
  server.route({
    method: ['GET', 'POST'],
    url: `${authenticationBasePath}/*`,
    handler: async (request, reply) => sendFetchResponse(reply, await authentication.handleAuthenticationRequest(toFetchRequest(request, publicUrl))),
  });

  server.addHook('onRequest', async (request, reply) => {
    if (!requiresLogin(request.url)) return;
    const user = await authentication.findSessionUser(toFetchHeaders(request));
    if (user) return void (request.sessionUser = user);
    if (request.url.startsWith('/admin')) return reply.redirect(`/login?next=${encodeURIComponent(request.url)}`);
    return reply.code(401).send({ error: 'Please log in' });
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    sessionUser?: import('./authentication.ts').SessionUser;
  }
}
