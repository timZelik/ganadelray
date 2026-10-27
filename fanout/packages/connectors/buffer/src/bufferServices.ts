import type { DestinationKind } from '@fanout/domain';

/** Which Buffer channel service can carry each destination kind. */
export const bufferServiceByDestination: Partial<Record<DestinationKind, string>> = {
  instagram_reels: 'instagram',
  tiktok: 'tiktok',
  youtube_shorts: 'youtube',
  linkedin: 'linkedin',
  facebook_reels: 'facebook',
  threads: 'threads',
  pinterest: 'pinterest',
  x: 'twitter',
};

export const bufferSupportedDestinations = Object.keys(bufferServiceByDestination) as DestinationKind[];

/** Per-network extras: Shorts need a title, Instagram videos must be marked as Reels. */
export function bufferMetadataFor(destinationKind: DestinationKind, title: string | null): Record<string, unknown> | undefined {
  if (destinationKind === 'youtube_shorts') return { youtube: { title: title ?? 'New video', categoryId: '22' } };
  if (destinationKind === 'instagram_reels') return { instagram: { type: 'reel', shouldShareToFeed: true } };
  return undefined;
}
