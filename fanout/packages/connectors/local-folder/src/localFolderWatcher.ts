import { createReadStream } from 'node:fs';
import { resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { SourceItemCandidate, SourceWatcher, WatchResult } from '@fanout/connectors-core';
import { PermanentError, type Connection } from '@fanout/domain';
import { externalIdFor, readSidecarCaption, scanHubFolder, titleFor, type HubFile } from './folderScan.ts';
import { localFolderSettingsSchema, parseCursor, type LocalFolderCursor } from './settings.ts';

export interface LocalFolderWatcherOptions {
  /** A file must be unchanged this long before ingest, so half-copied exports are never picked up. */
  settleMilliseconds?: number;
  maximumItemsPerPoll?: number;
  now?: () => number;
}

function directoryOf(connection: Connection): string {
  const parsed = localFolderSettingsSchema.safeParse(connection.settings);
  if (!parsed.success) throw new PermanentError(`Local folder connection ${connection.id} has no directory configured`);
  return resolve(parsed.data.directory);
}

function isNewSince(file: HubFile, cursor: LocalFolderCursor): boolean {
  if (file.arrivedMilliseconds > cursor.highWaterMarkMilliseconds) return true;
  return file.arrivedMilliseconds === cursor.highWaterMarkMilliseconds && !cursor.externalIdsAtHighWaterMark.includes(externalIdFor(file));
}

function advanceCursor(cursor: LocalFolderCursor, files: HubFile[]): LocalFolderCursor {
  const last = files.at(-1);
  if (!last) return cursor;
  const idsAtLast = files.filter((file) => file.arrivedMilliseconds === last.arrivedMilliseconds).map(externalIdFor);
  const carriedOver = last.arrivedMilliseconds === cursor.highWaterMarkMilliseconds ? cursor.externalIdsAtHighWaterMark : [];
  return { highWaterMarkMilliseconds: last.arrivedMilliseconds, externalIdsAtHighWaterMark: [...new Set([...carriedOver, ...idsAtLast])] };
}

async function toCandidate(file: HubFile, detectedAt: Date): Promise<SourceItemCandidate> {
  return { externalId: externalIdFor(file), title: titleFor(file), originalCaption: await readSidecarCaption(file), detectedAt, locator: { relativePath: file.relativePath } };
}

/** F1: the hub folder the creator drops clean master exports into. */
export function createLocalFolderWatcher({ settleMilliseconds = 5_000, maximumItemsPerPoll = 50, now = Date.now }: LocalFolderWatcherOptions = {}): SourceWatcher {
  return {
    sourceKind: 'local_folder',
    async listNewItemsSince(connection, rawCursor): Promise<WatchResult> {
      const cursor = parseCursor(rawCursor);
      const settledBefore = now() - settleMilliseconds;
      const newFiles = (await scanHubFolder(directoryOf(connection)))
        .filter((file) => file.arrivedMilliseconds <= settledBefore && isNewSince(file, cursor))
        .sort((left, right) => left.arrivedMilliseconds - right.arrivedMilliseconds || left.relativePath.localeCompare(right.relativePath))
        .slice(0, maximumItemsPerPoll);
      const detectedAt = new Date(now());
      return { items: await Promise.all(newFiles.map((file) => toCandidate(file, detectedAt))), nextCursor: advanceCursor(cursor, newFiles) };
    },
    async fetchMediaFile(connection, item) {
      const directory = directoryOf(connection);
      const absolutePath = resolve(directory, item.locator.relativePath ?? '');
      if (!absolutePath.startsWith(directory + sep)) throw new PermanentError(`Refusing to read outside the hub folder: ${item.locator.relativePath}`);
      return Readable.toWeb(createReadStream(absolutePath)) as ReadableStream<Uint8Array>;
    },
  };
}
