import type { DestinationKind } from '@fanout/api-contract';
import { classNames } from '../lib/classNames.ts';
import { destinationLabels } from '../lib/formatting.ts';

const platformStyles: Partial<Record<DestinationKind, { initials: string; className: string }>> = {
  instagram_reels: { initials: 'IG', className: 'bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600' },
  instagram_stories: { initials: 'IG', className: 'bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600' },
  instagram_feed: { initials: 'IG', className: 'bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600' },
  tiktok: { initials: 'TT', className: 'bg-neutral-900' },
  youtube_shorts: { initials: 'YT', className: 'bg-red-600' },
  linkedin: { initials: 'in', className: 'bg-sky-700' },
  facebook_reels: { initials: 'f', className: 'bg-blue-600' },
  threads: { initials: '@', className: 'bg-neutral-800' },
  pinterest: { initials: 'P', className: 'bg-red-700' },
  x: { initials: 'X', className: 'bg-black' },
};

/** A recognizable mark plus the platform's name; brand logos are not bundled, so initials on brand colours stand in. */
export function PlatformBadge({ destinationKind, size = 'medium' }: { destinationKind: DestinationKind; size?: 'small' | 'medium' }) {
  const style = platformStyles[destinationKind] ?? { initials: '•', className: 'bg-muted-foreground' };
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={classNames('inline-flex items-center justify-center rounded-md font-bold text-white', style.className, size === 'small' ? 'size-5 text-[9px]' : 'size-7 text-[11px]')}>{style.initials}</span>
      <span className="font-medium">{destinationLabels[destinationKind]}</span>
    </span>
  );
}
