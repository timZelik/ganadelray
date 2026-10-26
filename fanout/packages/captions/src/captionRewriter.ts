import type { DestinationKind } from '@fanout/domain';

export interface CaptionRewriteRequest {
  originalCaption: string;
  destinationKind: DestinationKind;
  characterLimit: number;
}

/** Optional step that adapts the source caption per platform before templating (Phase 5 adds an LLM implementation). */
export interface CaptionRewriter {
  readonly name: string;
  rewrite(request: CaptionRewriteRequest): Promise<string>;
}

export const noopCaptionRewriter: CaptionRewriter = {
  name: 'noop',
  rewrite: async ({ originalCaption }) => originalCaption,
};
