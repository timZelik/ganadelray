import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import type { Connection } from '@fanout/domain';
import { PermanentError } from '@fanout/domain';
import { createTemporaryDirectory } from '@fanout/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalFolderWatcher } from '../src/index.ts';

let hubDirectory: string;
let connection: Connection;
const later = () => Date.now() + 60_000;

beforeEach(async () => {
  hubDirectory = await createTemporaryDirectory('fanout-hub-');
  connection = { id: 'hub-connection', platform: 'local_folder', accountHandle: 'hub', tokenSet: null, scopes: [], expiresAt: null, status: 'active', settings: { directory: hubDirectory }, createdAt: new Date(), updatedAt: new Date() };
});

describe('local folder watcher', () => {
  it('lists settled videos, ignoring other files, hidden paths and files still being written', async () => {
    await writeFile(join(hubDirectory, 'morning-routine.mp4'), 'video');
    await writeFile(join(hubDirectory, 'notes.pdf'), 'pdf');
    await mkdir(join(hubDirectory, '.trash'));
    await writeFile(join(hubDirectory, '.trash', 'old.mp4'), 'video');
    await mkdir(join(hubDirectory, 'week-2'));
    await writeFile(join(hubDirectory, 'week-2', 'Clip_Two.MOV'), 'video');
    expect((await createLocalFolderWatcher().listNewItemsSince(connection, null)).items).toEqual([]);
    const { items } = await createLocalFolderWatcher({ now: later }).listNewItemsSince(connection, null);
    expect(items.map((item) => item.locator.relativePath).sort()).toEqual(['morning-routine.mp4', join('week-2', 'Clip_Two.MOV')]);
    expect(items.map((item) => item.title).sort()).toEqual(['Clip Two', 'morning routine']);
  });

  it('reports each file once across polls, even when a poll is capped', async () => {
    for (const name of ['a.mp4', 'b.mp4', 'c.mp4']) await writeFile(join(hubDirectory, name), name);
    const watcher = createLocalFolderWatcher({ now: later, maximumItemsPerPoll: 1 });
    const seen: string[] = [];
    let cursor: unknown = null;
    for (let poll = 0; poll < 5; poll += 1) {
      const result = await watcher.listNewItemsSince(connection, cursor);
      seen.push(...result.items.map((item) => item.locator.relativePath!));
      cursor = result.nextCursor;
    }
    expect(seen.sort()).toEqual(['a.mp4', 'b.mp4', 'c.mp4']);
  });

  it('detects a file moved in with an old modification time', async () => {
    const watcher = createLocalFolderWatcher({ now: later });
    await writeFile(join(hubDirectory, 'first.mp4'), 'first');
    const { nextCursor } = await watcher.listNewItemsSince(connection, null);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const movedPath = join(hubDirectory, 'moved-from-downloads.mp4');
    await writeFile(movedPath, 'moved');
    const yearsAgo = new Date('2020-01-01T00:00:00Z');
    await utimes(movedPath, yearsAgo, yearsAgo);
    const { items } = await watcher.listNewItemsSince(connection, nextCursor);
    expect(items.map((item) => item.locator.relativePath)).toEqual(['moved-from-downloads.mp4']);
  });

  it('reads the caption from a sidecar .txt file', async () => {
    await writeFile(join(hubDirectory, 'clip.mp4'), 'video');
    await writeFile(join(hubDirectory, 'clip.txt'), '  The hook line\n\nMore detail #tips \n');
    const [item] = (await createLocalFolderWatcher({ now: later }).listNewItemsSince(connection, null)).items;
    expect(item!.originalCaption).toBe('The hook line\n\nMore detail #tips');
  });

  it('streams the file and refuses paths that escape the hub', async () => {
    await writeFile(join(hubDirectory, 'clip.mp4'), 'video bytes');
    const watcher = createLocalFolderWatcher({ now: later });
    const [item] = (await watcher.listNewItemsSince(connection, null)).items;
    const stream = await watcher.fetchMediaFile(connection, item!);
    expect(await text(Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]))).toBe('video bytes');
    await expect(watcher.fetchMediaFile(connection, { ...item!, locator: { relativePath: '../../etc/passwd' } })).rejects.toBeInstanceOf(PermanentError);
  });

  it('fails permanently when the connection has no directory', async () => {
    await expect(createLocalFolderWatcher().listNewItemsSince({ ...connection, settings: {} }, null)).rejects.toBeInstanceOf(PermanentError);
  });
});
