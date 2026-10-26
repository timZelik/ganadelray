import { PermanentError, type DestinationKind, type PublisherRoute, type SourceKind } from '@fanout/domain';
import type { OAuthProvider } from './oauthProvider.ts';
import type { Publisher } from './publisher.ts';
import type { SourceWatcher } from './sourceWatcher.ts';

/** What a connector package exports; the app installs modules into a registry instead of switching on platform. */
export interface ConnectorModule {
  name: string;
  publishers?: readonly Publisher[];
  sourceWatchers?: readonly SourceWatcher[];
  oauthProviders?: readonly OAuthProvider[];
}

export interface ConnectorRegistry {
  getPublisher(route: PublisherRoute, destinationKind: DestinationKind): Publisher;
  getSourceWatcher(sourceKind: SourceKind): SourceWatcher;
  listPublishers(): Publisher[];
  listSourceWatchers(): SourceWatcher[];
}

function publisherKey(route: PublisherRoute, destinationKind: DestinationKind): string {
  return `${route}:${destinationKind}`;
}

function indexUnique<Entry>(entries: Entry[], keyOf: (entry: Entry) => string, label: string): Map<string, Entry> {
  const index = new Map<string, Entry>();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (index.has(key)) throw new Error(`Two connector modules register the same ${label} "${key}"`);
    index.set(key, entry);
  }
  return index;
}

function requireEntry<Entry>(index: Map<string, Entry>, key: string, label: string): Entry {
  const entry = index.get(key);
  if (!entry) throw new PermanentError(`No ${label} is installed for "${key}"`);
  return entry;
}

export function createConnectorRegistry(modules: readonly ConnectorModule[]): ConnectorRegistry {
  const publishers = indexUnique(modules.flatMap((module) => module.publishers ?? []), (publisher) => publisherKey(publisher.route, publisher.destinationKind), 'publisher');
  const sourceWatchers = indexUnique(modules.flatMap((module) => module.sourceWatchers ?? []), (watcher) => watcher.sourceKind, 'source watcher');
  return {
    getPublisher: (route, destinationKind) => requireEntry(publishers, publisherKey(route, destinationKind), 'publisher'),
    getSourceWatcher: (sourceKind) => requireEntry(sourceWatchers, sourceKind, 'source watcher'),
    listPublishers: () => [...publishers.values()],
    listSourceWatchers: () => [...sourceWatchers.values()],
  };
}
