import { composeCaption } from '@fanout/captions';
import { destinationCapabilities, type DestinationKind } from '@fanout/domain';

const sampleCaption = 'Come inside the studio with me. Here is where every piece starts.\n\nWhich corner should I show next?';

/** Runs the same caption engine the server uses, on a sample, so the effect of a template is visible before saving. */
export function CaptionPreview({ destinationKind, template, hashtags }: { destinationKind: DestinationKind; template: string; hashtags: string[] }) {
  const limits = destinationCapabilities[destinationKind];
  const { caption, title } = composeCaption({ template, originalCaption: sampleCaption, sourceTitle: 'Studio tour', destinationHashtags: hashtags, limits, stripUrls: destinationKind === 'x' });
  return (
    <div className="rounded-lg bg-muted p-3 text-sm" data-testid="caption-preview">
      <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Example post</p>
      {title && <p className="font-semibold">{title}</p>}
      <p className="whitespace-pre-line">{caption || <span className="text-muted-foreground">(no caption)</span>}</p>
      <p className="mt-1 text-xs text-muted-foreground">{caption.length} / {limits.captionCharacterLimit.toLocaleString()} characters</p>
    </div>
  );
}
