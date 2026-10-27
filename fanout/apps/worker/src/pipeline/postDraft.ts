import { composeCaption } from '@fanout/captions';
import type { PostDraft } from '@fanout/connectors-core';
import type { PublishJobContext } from './publishJobContext.ts';
import type { WorkerDependencies } from '../dependencies.ts';

/** Source caption → optional rewrite → template + hashtags + limits → the post one destination receives. */
export async function buildPostDraft({ captionRewriter, settings }: WorkerDependencies, { destination, sourceItem, publisher }: PublishJobContext): Promise<PostDraft> {
  const limits = publisher.capabilities;
  const originalCaption = sourceItem.originalCaption === null
    ? null
    : await captionRewriter.rewrite({ originalCaption: sourceItem.originalCaption, destinationKind: destination.destinationKind, characterLimit: limits.captionCharacterLimit });
  return composeCaption({
    template: destination.captionTemplate,
    originalCaption,
    sourceTitle: sourceItem.title,
    destinationHashtags: destination.hashtags,
    limits,
    stripUrls: destination.destinationKind === 'x' && settings.xCostSavingMode,
  });
}
