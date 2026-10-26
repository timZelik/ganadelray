import { describe, expect, it } from 'vitest';
import { developmentOnlyEncryptionKey, loadEnvironment } from '../src/index.ts';

const minimalEnvironment = {
  DATABASE_URL: 'postgres://fanout:fanout@localhost:5432/fanout',
  REDIS_URL: 'redis://localhost:6379',
  S3_BUCKET: 'fanout',
  S3_ACCESS_KEY_ID: 'access',
  S3_SECRET_ACCESS_KEY: 'secret',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

describe('loadEnvironment', () => {
  it('applies safe defaults: dry-run on, 7-day retention, 24h presigned URLs', () => {
    const environment = loadEnvironment(minimalEnvironment);
    expect(environment.PUBLISH_DRY_RUN).toBe(true);
    expect(environment.RENDERED_ASSET_RETENTION_DAYS).toBe(7);
    expect(environment.PRESIGNED_URL_TTL_SECONDS).toBe(86_400);
  });

  it('parses "false" as false rather than as a truthy string', () => {
    expect(loadEnvironment({ ...minimalEnvironment, PUBLISH_DRY_RUN: 'false' }).PUBLISH_DRY_RUN).toBe(false);
  });

  it('refuses the published development key in production', () => {
    const withDevelopmentKey = { ...minimalEnvironment, TOKEN_ENCRYPTION_KEY: developmentOnlyEncryptionKey };
    expect(loadEnvironment(withDevelopmentKey).TOKEN_ENCRYPTION_KEY).toBe(developmentOnlyEncryptionKey);
    expect(() => loadEnvironment({ ...withDevelopmentKey, NODE_ENV: 'production' })).toThrow(/must not be used in production/);
  });

  it('rejects an encryption key that is not 32 bytes', () => {
    expect(() => loadEnvironment({ ...minimalEnvironment, TOKEN_ENCRYPTION_KEY: 'short' })).toThrow(/32 bytes/);
  });
});
