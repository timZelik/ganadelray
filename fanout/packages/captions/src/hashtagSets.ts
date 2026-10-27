import { countHashtags, extractHashtags } from '@fanout/domain';

export function normalizeHashtag(tag: string): string | null {
  const word = tag.trim().replace(/^#+/, '').replace(/\s+/g, '');
  return word === '' ? null : `#${word}`;
}

/** Normalizes, drops duplicates (case-insensitively) and tags the caption already contains. */
export function selectDestinationHashtags(destinationHashtags: readonly string[], captionText: string, hashtagLimit: number | null): string[] {
  const alreadyPresent = new Set(extractHashtags(captionText).map((tag) => tag.toLowerCase()));
  const unique = new Map<string, string>();
  for (const tag of destinationHashtags.map(normalizeHashtag)) {
    if (tag && !alreadyPresent.has(tag.toLowerCase()) && !unique.has(tag.toLowerCase())) unique.set(tag.toLowerCase(), tag);
  }
  const remainingAllowance = hashtagLimit === null ? Number.POSITIVE_INFINITY : Math.max(0, hashtagLimit - countHashtags(captionText));
  return [...unique.values()].slice(0, remainingAllowance);
}
