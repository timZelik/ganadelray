import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

export type { StartedTestContainer } from 'testcontainers';
export type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export const containerImages = {
  postgres: 'postgres:17-alpine',
  redis: 'valkey/valkey:8-alpine',
  s3: 'chrislusf/seaweedfs:4.50',
} as const;

export interface StartedS3 {
  container: StartedTestContainer;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export async function startPostgresContainer(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer(containerImages.postgres).withDatabase('fanout').withUsername('fanout').withPassword('fanout').start();
}

export async function startRedisContainer(): Promise<{ container: StartedTestContainer; url: string }> {
  const container = await new GenericContainer(containerImages.redis).withExposedPorts(6379).withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/)).start();
  return { container, url: `redis://${container.getHost()}:${container.getMappedPort(6379)}` };
}

/** SeaweedFS's single-process S3 server: MinIO no longer publishes community container images. */
export async function startS3Container(): Promise<StartedS3> {
  const accessKeyId = 'fanout-test';
  const secretAccessKey = 'fanout-test-secret';
  const container = await new GenericContainer(containerImages.s3)
    .withCommand(['mini', '-dir=/data'])
    .withEnvironment({ AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey })
    .withExposedPorts(8333)
    .withWaitStrategy(Wait.forHttp('/', 8333).forStatusCodeMatching(() => true))
    .start();
  return { container, endpoint: `http://${container.getHost()}:${container.getMappedPort(8333)}`, accessKeyId, secretAccessKey };
}
