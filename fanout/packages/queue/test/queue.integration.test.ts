import { PermanentError, RetryableError } from '@fanout/domain';
import { startRedisContainer, type StartedTestContainer } from '@fanout/testing';
import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDistributedLock, createPipelineQueues, createRateLimiter, createRedisConnection, delayJobUntil, retryAfterAwareBackoff, runWithErrorPolicy, type FinalFailure, type PipelineQueues } from '../src/index.ts';

let container: StartedTestContainer;
let redis: Redis;
let queues: PipelineQueues;

beforeAll(async () => {
  const started = await startRedisContainer();
  container = started.container;
  redis = createRedisConnection(started.url);
  queues = createPipelineQueues(redis);
});

afterAll(async () => {
  await queues?.close();
  redis?.disconnect();
  await container?.stop();
});

describe('rate limiter', () => {
  it('allows operations up to the limit, then reports when the window frees up', async () => {
    const limiter = createRateLimiter(redis);
    const rules = [{ key: 'platform:test', maximumOperations: 2, windowMilliseconds: 10_000 }];
    expect(await limiter.acquire(rules, 'a', 1_000)).toEqual({ allowed: true });
    expect(await limiter.acquire(rules, 'b', 2_000)).toEqual({ allowed: true });
    expect(await limiter.acquire(rules, 'c', 3_000)).toEqual({ allowed: false, retryAfterMilliseconds: 8_000 });
    expect(await limiter.acquire(rules, 'd', 11_001)).toEqual({ allowed: true });
  });

  it('claims all windows or none: a full per-platform window does not consume per-connection quota', async () => {
    const limiter = createRateLimiter(redis);
    const platform = { key: 'platform:shared', maximumOperations: 1, windowMilliseconds: 60_000 };
    const connection = { key: 'connection:one', maximumOperations: 5, windowMilliseconds: 60_000 };
    expect((await limiter.acquire([platform, connection], 'first', 1_000)).allowed).toBe(true);
    expect((await limiter.acquire([platform, connection], 'second', 2_000)).allowed).toBe(false);
    expect(await redis.zcard('fanout:rate-limit:connection:one')).toBe(1);
  });
});

describe('error policy on a real BullMQ worker', () => {
  async function runUntilSettled(behaviour: (job: Job) => Promise<void>, attempts: number) {
    const failures: FinalFailure[] = [];
    let calls = 0;
    const worker = new Worker('policy-test', async (job) => {
      calls += 1;
      await runWithErrorPolicy(job, { onFinalFailure: async (failure) => void failures.push(failure) }, () => behaviour(job));
    }, { connection: redis.duplicate(), settings: { backoffStrategy: () => 10 } });
    const queue = new Queue('policy-test', { connection: redis });
    const job = await queue.add('job', {}, { attempts, backoff: { type: 'retry-after-aware' } });
    await expect.poll(() => job.getState(), { timeout: 10_000 }).toMatch(/failed|completed/);
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    return { failures, calls };
  }

  it('fails permanent errors immediately without retrying', async () => {
    const { failures, calls } = await runUntilSettled(async () => {
      throw new PermanentError('video too long');
    }, 5);
    expect(calls).toBe(1);
    expect(failures).toMatchObject([{ kind: 'permanent', message: 'video too long' }]);
  });

  it('retries retryable errors and records the failure only after the last attempt', async () => {
    const { failures, calls } = await runUntilSettled(async () => {
      throw new RetryableError('503');
    }, 3);
    expect(calls).toBe(3);
    expect(failures).toHaveLength(1);
  });
});

describe('retryAfterAwareBackoff', () => {
  it('uses Retry-After when present and exponential backoff otherwise', () => {
    expect(retryAfterAwareBackoff(1, 'x', new RetryableError('429', { retryAfterMilliseconds: 42_000 }))).toBe(42_000);
    expect(retryAfterAwareBackoff(1)).toBe(5_000);
    expect(retryAfterAwareBackoff(3)).toBe(20_000);
    expect(retryAfterAwareBackoff(50)).toBe(15 * 60 * 1000);
  });
});

describe('pipeline queues', () => {
  it('deduplicates ingest jobs for the same detected item', async () => {
    const payload = { connectionId: '00000000-0000-4000-8000-000000000001', candidate: { externalId: 'clip:1.mp4', title: null, originalCaption: null, detectedAt: new Date().toISOString(), locator: {} } };
    await queues.enqueueIngest(payload);
    await queues.enqueueIngest(payload);
    expect(await queues.ingest.getJobCountByTypes('waiting', 'delayed', 'prioritized')).toBe(1);
  });

  it('delayJobUntil is exported for rate-limit parking', () => {
    expect(typeof delayJobUntil).toBe('function');
  });
});

describe('distributed lock', () => {
  it('lets exactly one concurrent caller run, and frees the lock afterwards', async () => {
    const lock = createDistributedLock(redis);
    let running = 0;
    let maximumConcurrency = 0;
    const work = async () => {
      running += 1;
      maximumConcurrency = Math.max(maximumConcurrency, running);
      await new Promise((resolve) => setTimeout(resolve, 50));
      running -= 1;
      return 'rendered';
    };
    const attempts = await Promise.all([1, 2, 3].map(() => lock.runExclusive('render-x', 10_000, work)));
    expect(attempts.filter((attempt) => attempt.acquired)).toEqual([{ acquired: true, result: 'rendered' }]);
    expect(maximumConcurrency).toBe(1);
    expect((await lock.runExclusive('render-x', 10_000, work)).acquired).toBe(true);
  });

  it('releases the lock when the work throws', async () => {
    const lock = createDistributedLock(redis);
    await expect(lock.runExclusive('render-y', 10_000, async () => { throw new Error('ffmpeg crashed'); })).rejects.toThrow('ffmpeg crashed');
    expect((await lock.runExclusive('render-y', 10_000, async () => 'ok')).acquired).toBe(true);
  });
});
