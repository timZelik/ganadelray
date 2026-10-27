import type { Database } from '@fanout/database';
import { schema } from '@fanout/database';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface NewAccount {
  email: string;
  name: string;
  password: string;
}

/** What the HTTP layer needs from login, so routes can be tested with a fake. */
export interface Authentication {
  handleAuthenticationRequest(request: Request): Promise<Response>;
  findSessionUser(headers: Headers): Promise<SessionUser | null>;
  /** Creates the account, or resets its password if the email already exists. */
  upsertAccount(account: NewAccount): Promise<'created' | 'password_reset'>;
}

export interface AuthenticationSettings {
  database: Database;
  secret: string;
  publicUrl: string;
  /** Extra browser origins allowed to call the login endpoints, e.g. the Vite dev server. */
  additionalTrustedOrigins?: string[];
}

const thirtyDaysInSeconds = 30 * 24 * 60 * 60;

/** Email + password login with public sign-up disabled: accounts are created by the owner, never by strangers. */
export function createAuthentication({ database, secret, publicUrl, additionalTrustedOrigins = [] }: AuthenticationSettings): Authentication {
  const auth = betterAuth({
    appName: 'Fanout',
    baseURL: publicUrl,
    basePath: '/api/auth',
    secret,
    trustedOrigins: [publicUrl, ...additionalTrustedOrigins],
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: { user: schema.authUsers, session: schema.authSessions, account: schema.authAccounts, verification: schema.authVerifications },
    }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
    session: { expiresIn: thirtyDaysInSeconds, updateAge: 24 * 60 * 60 },
  });

  return {
    handleAuthenticationRequest: (request) => auth.handler(request),
    async findSessionUser(headers) {
      const session = await auth.api.getSession({ headers });
      return session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
    },
    async upsertAccount({ email, name, password }) {
      const context = await auth.$context;
      const passwordHash = await context.password.hash(password);
      const existing = await context.internalAdapter.findUserByEmail(email.toLowerCase());
      if (existing) {
        await context.internalAdapter.updatePassword(existing.user.id, passwordHash);
        return 'password_reset';
      }
      const user = await context.internalAdapter.createUser({ email: email.toLowerCase(), name, emailVerified: true }, { method: 'email-password' });
      await context.internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: passwordHash });
      return 'created';
    },
  };
}
