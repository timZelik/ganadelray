import { fetchBufferAccount } from '@fanout/connector-buffer';
import { createHttpClient } from '@fanout/connectors-core';
import { loadEnvironment } from '@fanout/config';
import { createDatabase, createRepositories, createTokenCipher } from '@fanout/database';
import { createCorrelationId, createLogger } from '@fanout/logging';
import { createPipelineQueues, createRedisConnection } from '@fanout/queue';
import { createS3ObjectStorage } from '@fanout/storage';
import { createAuthentication } from './authentication/authentication.ts';
import { buildApiServer } from './server.ts';

const environment = loadEnvironment();
const logger = createLogger({ serviceName: 'fanout-api', level: environment.LOG_LEVEL, pretty: environment.LOG_PRETTY });
const databaseHandle = createDatabase(environment.DATABASE_URL);
const repositories = createRepositories(databaseHandle.database, createTokenCipher(environment.TOKEN_ENCRYPTION_KEY));
const redis = createRedisConnection(environment.REDIS_URL);
const queues = createPipelineQueues(redis);
const storage = createS3ObjectStorage({
  bucket: environment.S3_BUCKET, region: environment.S3_REGION, accessKeyId: environment.S3_ACCESS_KEY_ID, secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
  endpoint: environment.S3_ENDPOINT, publicEndpoint: environment.S3_PUBLIC_ENDPOINT, forcePathStyle: environment.S3_FORCE_PATH_STYLE,
});
await storage.ensureBucket();
const http = createHttpClient({ auditSink: repositories.auditLogRepository, logger });

const server = await buildApiServer({
  ...repositories,
  storage,
  queues,
  authentication: createAuthentication({
    database: databaseHandle.database,
    secret: environment.AUTH_SECRET,
    publicUrl: environment.PUBLIC_URL,
    additionalTrustedOrigins: environment.NODE_ENV === 'development' ? ['http://localhost:5173'] : [],
  }),
  fetchBufferAccount: (apiKey) => fetchBufferAccount({ http, apiKey, correlationId: createCorrelationId() }),
  logger,
  dryRun: environment.PUBLISH_DRY_RUN,
  publicUrl: environment.PUBLIC_URL,
  maximumUploadBytes: environment.MAXIMUM_UPLOAD_MEGABYTES * 1_048_576,
  now: () => new Date(),
});
await server.listen({ host: environment.API_HOST, port: environment.API_PORT });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(async () => {
      await queues.close();
      redis.disconnect();
      await databaseHandle.close();
      process.exit(0);
    });
  });
}
