import { testEncryptionKey } from './factories.ts';
import type { StartedS3 } from './containers.ts';

export interface TestInfrastructure {
  databaseUrl: string;
  redisUrl: string;
  s3: StartedS3;
}

/** A complete, valid environment pointed at Testcontainers infrastructure. */
export function buildTestEnvironment({ databaseUrl, redisUrl, s3 }: TestInfrastructure, overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'warn',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    S3_ENDPOINT: s3.endpoint,
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'fanout-test',
    S3_ACCESS_KEY_ID: s3.accessKeyId,
    S3_SECRET_ACCESS_KEY: s3.secretAccessKey,
    TOKEN_ENCRYPTION_KEY: testEncryptionKey,
    PUBLISH_DRY_RUN: 'true',
    WATCH_INTERVAL_SECONDS: '1',
    HUB_SETTLE_SECONDS: '0',
    ENABLE_HUB_FOLDER: 'true',
    ...overrides,
  };
}
