import { loadEnvironment } from '@fanout/config';
import { createDatabase, createPublishJobRepository } from '@fanout/database';
import { createLogger } from '@fanout/logging';
import { createPipelineQueues, createRedisConnection } from '@fanout/queue';
import { buildApiServer } from './server.ts';

const environment = loadEnvironment();
const logger = createLogger({ serviceName: 'fanout-api', level: environment.LOG_LEVEL, pretty: environment.NODE_ENV === 'development' });
const databaseHandle = createDatabase(environment.DATABASE_URL);
const redis = createRedisConnection(environment.REDIS_URL);
const queues = createPipelineQueues(redis);

const server = await buildApiServer({
  publishJobRepository: createPublishJobRepository(databaseHandle.database),
  queues,
  logger,
  dryRun: environment.PUBLISH_DRY_RUN,
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
