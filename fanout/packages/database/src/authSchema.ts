import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** better-auth's core tables (users, sessions, credential accounts, verification tokens), owned by our migrations. */
const authTimestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

export const authUsers = pgTable('auth_users', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  ...authTimestamps,
});

export const authSessions = pgTable('auth_sessions', {
  id: text().primaryKey(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  token: text().notNull().unique(),
  ipAddress: text(),
  userAgent: text(),
  userId: text().notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  ...authTimestamps,
}, (table) => [index().on(table.userId)]);

export const authAccounts = pgTable('auth_accounts', {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text().notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  password: text(),
  ...authTimestamps,
}, (table) => [index().on(table.userId)]);

export const authVerifications = pgTable('auth_verifications', {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  ...authTimestamps,
}, (table) => [index().on(table.identifier)]);
