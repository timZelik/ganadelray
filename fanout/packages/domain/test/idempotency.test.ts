import { describe, expect, it } from 'vitest';
import { createPublishJobIdempotencyKey } from '../src/index.ts';

describe('createPublishJobIdempotencyKey', () => {
  it('is deterministic for the same source item and destination', async () => {
    const first = await createPublishJobIdempotencyKey('source-1', 'destination-1');
    expect(await createPublishJobIdempotencyKey('source-1', 'destination-1')).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs when either side differs, including ambiguous concatenations', async () => {
    const keys = await Promise.all([
      createPublishJobIdempotencyKey('source-1', 'destination-1'),
      createPublishJobIdempotencyKey('source-1', 'destination-2'),
      createPublishJobIdempotencyKey('source-2', 'destination-1'),
      createPublishJobIdempotencyKey('ab', 'c'),
      createPublishJobIdempotencyKey('a', 'bc'),
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
