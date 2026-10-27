import { describe, expect, it } from 'vitest';
import { toFriendlyProblem } from '../src/friendlyProblems.ts';

describe('toFriendlyProblem', () => {
  it.each([
    ['Not publishable to tiktok: Video is 2.02s; minimum is 3s', 'Too short for this platform: it needs at least 3 seconds.'],
    ['Not publishable to youtube_shorts: Video is 200s; maximum is 180s', 'Too long for this platform: the limit is 3 minutes.'],
    ['File is not readable media (corrupt or unsupported): ffprobe exited with code 1', "We couldn't read this file. Try exporting it again as an MP4."],
    ['Buffer refused the post: Video is too long for this channel', "Buffer couldn't post it: Video is too long for this channel"],
    ['Choose which Buffer channel tiktok should post to', 'Pick which account this platform posts to, on the Platforms page.'],
    ['Connection gana needs to be reconnected', 'Buffer needs to be reconnected on the Platforms page.'],
    ['POST https://api.buffer.com/ failed with HTTP 503', "The service didn't answer in time. Press Try again."],
  ])('explains "%s" in plain words', (technical, friendly) => {
    expect(toFriendlyProblem(technical)).toBe(friendly);
  });

  it('falls back to a shortened original message, and passes null through', () => {
    expect(toFriendlyProblem(`Not publishable to x: ${'something odd '.repeat(30)}`)!.length).toBeLessThanOrEqual(161);
    expect(toFriendlyProblem(null)).toBeNull();
  });
});
