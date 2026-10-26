import type { PublisherCapabilities } from '@fanout/domain';
import { selectDestinationHashtags } from './hashtagSets.ts';
import { renderTemplate, type CaptionValues } from './placeholders.ts';
import { firstLineOf, stripUrls, truncateToLength } from './textTransforms.ts';

export type CaptionLimits = Pick<PublisherCapabilities, 'captionCharacterLimit' | 'titleCharacterLimit' | 'hashtagLimit'>;

export interface CaptionRequest {
  template: string;
  originalCaption: string | null;
  sourceTitle: string | null;
  destinationHashtags: readonly string[];
  limits: CaptionLimits;
  /** X charges more for posts with URLs; cost-saving mode strips them. */
  stripUrls: boolean;
}

export interface ComposedCaption {
  caption: string;
  title: string | null;
  hashtags: string[];
}

function buildValues(originalCaption: string, sourceTitle: string | null, hashtags: string[]): CaptionValues {
  const firstLine = firstLineOf(originalCaption);
  return { originalCaption, hashtags: hashtags.join(' '), title: sourceTitle ?? firstLine, firstLine };
}

/** Gives the original caption whatever room the template, hashtags and limit leave, so hashtags survive truncation. */
function fitCaption(template: string, originalCaption: string, sourceTitle: string | null, hashtags: string[], limit: number): string {
  const rendered = renderTemplate(template, buildValues(originalCaption, sourceTitle, hashtags));
  if (rendered.length <= limit) return rendered;
  const overflow = rendered.length - limit;
  const shortenedCaption = truncateToLength(originalCaption, Math.max(0, originalCaption.length - overflow));
  const refitted = renderTemplate(template, buildValues(shortenedCaption, sourceTitle, hashtags));
  return truncateToLength(refitted, limit);
}

function composeTitle(sourceTitle: string | null, originalCaption: string, titleCharacterLimit: number | null): string | null {
  if (titleCharacterLimit === null) return null;
  const candidate = sourceTitle ?? firstLineOf(originalCaption);
  return truncateToLength(candidate, titleCharacterLimit);
}

/** Template + per-destination hashtags + platform limits → the caption (and title) one destination will receive. */
export function composeCaption(request: CaptionRequest): ComposedCaption {
  const rawCaption = request.originalCaption ?? '';
  const originalCaption = request.stripUrls ? stripUrls(rawCaption) : rawCaption;
  const hashtags = selectDestinationHashtags(request.destinationHashtags, originalCaption, request.limits.hashtagLimit);
  const caption = fitCaption(request.template, originalCaption, request.sourceTitle, hashtags, request.limits.captionCharacterLimit);
  return { caption, title: composeTitle(request.sourceTitle, originalCaption, request.limits.titleCharacterLimit), hashtags };
}
