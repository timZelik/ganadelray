import type { Connection, SourceKind } from '@fanout/domain';

/** A new item a watcher detected; it becomes a SourceItem once its master file is ingested. */
export interface SourceItemCandidate {
  externalId: string;
  title: string | null;
  originalCaption: string | null;
  detectedAt: Date;
  /** Watcher-specific locator (file path, media URL, ...) needed to fetch the file later. */
  locator: Record<string, string>;
}

export interface WatchResult {
  items: SourceItemCandidate[];
  /** Opaque to the pipeline; each watcher validates its own cursor shape. */
  nextCursor: unknown;
}

export interface SourceWatcher {
  readonly sourceKind: SourceKind;
  listNewItemsSince(connection: Connection, cursor: unknown): Promise<WatchResult>;
  /** `null` when the source only exposes metadata (e.g. TikTok Display API) and the master arrives via the hub. */
  fetchMediaFile(connection: Connection, item: SourceItemCandidate): Promise<ReadableStream<Uint8Array> | null>;
}
