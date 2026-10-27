import { PermanentError, type Connection } from '@fanout/domain';
import { createInMemoryObjectStorage, toNodeReadable } from '@fanout/storage';
import { text } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { createUploadWatcher } from '../src/index.ts';

const connection = { id: 'uploads' } as Connection;
const candidate = { externalId: 'upload-1', title: 'Clip', originalCaption: null, detectedAt: new Date(), locator: { storageKey: 'uploads/upload-1.mp4' } };

describe('upload watcher', () => {
  it('never polls, reads the uploaded file, and deletes it once ingested', async () => {
    const storage = createInMemoryObjectStorage();
    await storage.upload('uploads/upload-1.mp4', new TextEncoder().encode('video'), 'video/mp4');
    const watcher = createUploadWatcher(storage);
    expect(await watcher.listNewItemsSince(connection, 'cursor')).toEqual({ items: [], nextCursor: 'cursor' });
    expect(await text(toNodeReadable((await watcher.fetchMediaFile(connection, candidate))!))).toBe('video');
    await watcher.onIngested!(connection, candidate);
    expect(await storage.objectExists('uploads/upload-1.mp4')).toBe(false);
  });

  it('refuses locators outside the uploads area', async () => {
    const watcher = createUploadWatcher(createInMemoryObjectStorage());
    await expect(watcher.fetchMediaFile(connection, { ...candidate, locator: { storageKey: 'masters/secret.mp4' } })).rejects.toBeInstanceOf(PermanentError);
  });
});
