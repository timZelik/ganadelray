import { Redis } from 'ioredis';

/** BullMQ workers require `maxRetriesPerRequest: null` so blocking commands survive reconnects. */
export function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });
}
