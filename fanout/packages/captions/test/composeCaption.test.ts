import { destinationCapabilities } from '@fanout/domain';
import { describe, expect, it } from 'vitest';
import { composeCaption, noopCaptionRewriter, type CaptionRequest } from '../src/index.ts';

function request(overrides: Partial<CaptionRequest> = {}): CaptionRequest {
  return {
    template: '{{originalCaption}}\n\n{{hashtags}}',
    originalCaption: 'Morning routine that changed everything',
    sourceTitle: null,
    destinationHashtags: ['reels', '#Fitness', 'reels', ''],
    limits: destinationCapabilities.instagram_reels,
    stripUrls: false,
    ...overrides,
  };
}

describe('composeCaption', () => {
  it('appends normalized, de-duplicated destination hashtags', () => {
    expect(composeCaption(request())).toEqual({
      caption: 'Morning routine that changed everything\n\n#reels #Fitness',
      title: null,
      hashtags: ['#reels', '#Fitness'],
    });
  });

  it('skips hashtags the original caption already has and respects the hashtag limit', () => {
    const composed = composeCaption(request({ originalCaption: 'Day one #fitness', destinationHashtags: ['fitness', 'gym', 'health'], limits: { ...destinationCapabilities.threads } }));
    expect(composed.hashtags).toEqual([]);
    expect(composed.caption).toBe('Day one #fitness');
  });

  it('shortens the original caption, not the hashtags, to fit the limit', () => {
    const composed = composeCaption(request({ originalCaption: 'word '.repeat(100).trim(), destinationHashtags: ['keepme'], limits: { captionCharacterLimit: 60, titleCharacterLimit: null, hashtagLimit: null } }));
    expect(composed.caption.length).toBeLessThanOrEqual(60);
    expect(composed.caption.endsWith('#keepme')).toBe(true);
    expect(composed.caption).toContain('…');
  });

  it('hard-truncates when the template itself exceeds the limit', () => {
    const composed = composeCaption(request({ template: `${'static '.repeat(10)}{{originalCaption}}`, limits: { captionCharacterLimit: 20, titleCharacterLimit: null, hashtagLimit: null } }));
    expect(composed.caption.length).toBeLessThanOrEqual(20);
  });

  it('strips URLs in cost-saving mode for X', () => {
    const composed = composeCaption(request({ originalCaption: 'New video https://youtu.be/abc', destinationHashtags: [], limits: destinationCapabilities.x, stripUrls: true }));
    expect(composed.caption).toBe('New video');
  });

  it('derives a title from the first line for platforms with titles, within the title limit', () => {
    const composed = composeCaption(request({ originalCaption: `${'Long hook '.repeat(15)}\nbody`, limits: destinationCapabilities.youtube_shorts }));
    expect(composed.title!.length).toBeLessThanOrEqual(100);
    expect(composed.title!.startsWith('Long hook')).toBe(true);
    expect(composeCaption(request({ sourceTitle: 'Explicit title', limits: destinationCapabilities.youtube_shorts })).title).toBe('Explicit title');
  });

  it('produces an empty caption for destinations without captions (Stories)', () => {
    expect(composeCaption(request({ limits: destinationCapabilities.instagram_stories })).caption).toBe('');
  });

  it('handles a source with no caption at all', () => {
    expect(composeCaption(request({ originalCaption: null, destinationHashtags: ['a'] })).caption).toBe('#a');
  });
});

describe('noopCaptionRewriter', () => {
  it('returns the caption unchanged', async () => {
    expect(await noopCaptionRewriter.rewrite({ originalCaption: 'same', destinationKind: 'tiktok', characterLimit: 10 })).toBe('same');
  });
});
