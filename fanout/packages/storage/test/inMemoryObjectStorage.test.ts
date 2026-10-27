import { text } from 'node:stream/consumers';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createInMemoryObjectStorage, storageKeys, toNodeReadable } from '../src/index.ts';

describe('in-memory object storage', () => {
  it('honours the ObjectStorage contract for streams', async () => {
    const storage = createInMemoryObjectStorage();
    await storage.upload('key', Readable.from(['he', 'llo']), 'text/plain');
    expect(await text(toNodeReadable(await storage.openReadStream('key')))).toBe('hello');
    await expect(storage.openReadStream('missing')).rejects.toThrow(/NoSuchKey/);
  });
});

describe('storageKeys', () => {
  it('separates masters from renditions so retention never touches masters', () => {
    const masterKey = storageKeys.master('connection-1', 'abc', '.mov');
    expect(masterKey).toBe('masters/connection-1/abc.mov');
    expect(storageKeys.isMaster(masterKey)).toBe(true);
    expect(storageKeys.isMaster(storageKeys.rendition('item-1', 'fingerprint'))).toBe(false);
  });
});
