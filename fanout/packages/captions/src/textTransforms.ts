const ellipsis = '…';
const urlPattern = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** Only back up to a word boundary when it costs less than this share of the kept text. */
const wordBoundaryTolerance = 0.3;

export function firstLineOf(text: string): string {
  return text.split('\n').find((line) => line.trim() !== '')?.trim() ?? '';
}

export function stripUrls(text: string): string {
  return text.replace(urlPattern, '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '').trim();
}

function takeWholeGraphemes(text: string, maximumLength: number): string {
  let kept = '';
  for (const { segment } of graphemeSegmenter.segment(text)) {
    if (kept.length + segment.length > maximumLength) break;
    kept += segment;
  }
  return kept;
}

function endsOnWordBoundary(fullText: string, kept: string): boolean {
  return /^\s?$/.test(fullText.charAt(kept.length));
}

function backUpToWordBoundary(fullText: string, kept: string): string {
  if (endsOnWordBoundary(fullText, kept)) return kept;
  const lastWhitespace = kept.search(/\s\S*$/);
  return lastWhitespace >= kept.length * (1 - wordBoundaryTolerance) ? kept.slice(0, lastWhitespace) : kept;
}

/**
 * Shortens text to at most `maximumLength` UTF-16 units (the strictest way platforms count),
 * never splitting an emoji or accented character, preferring a word boundary.
 */
export function truncateToLength(text: string, maximumLength: number): string {
  if (text.length <= maximumLength) return text;
  if (maximumLength <= ellipsis.length) return takeWholeGraphemes(text, Math.max(0, maximumLength));
  const kept = backUpToWordBoundary(text, takeWholeGraphemes(text, maximumLength - ellipsis.length));
  return `${kept.trimEnd()}${ellipsis}`;
}
