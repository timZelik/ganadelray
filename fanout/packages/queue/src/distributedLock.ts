import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

const keyPrefix = 'fanout:lock:';
/** Deletes the key only if this holder still owns it, so an expired lock taken over by another worker is never released by us. */
const releaseScript = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

export interface DistributedLock {
  /** Runs `work` only if the lock is free; returns `{ acquired: false }` immediately otherwise. */
  runExclusive<Result>(key: string, timeToLiveMilliseconds: number, work: () => Promise<Result>): Promise<{ acquired: true; result: Result } | { acquired: false }>;
}

export function createDistributedLock(redis: Redis): DistributedLock {
  return {
    async runExclusive(key, timeToLiveMilliseconds, work) {
      const ownerToken = randomUUID();
      const acquired = await redis.set(`${keyPrefix}${key}`, ownerToken, 'PX', timeToLiveMilliseconds, 'NX');
      if (acquired !== 'OK') return { acquired: false };
      try {
        return { acquired: true, result: await work() };
      } finally {
        await redis.eval(releaseScript, 1, `${keyPrefix}${key}`, ownerToken);
      }
    },
  };
}
