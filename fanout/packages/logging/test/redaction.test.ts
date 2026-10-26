import { describe, expect, it } from 'vitest';
import { redactSecrets, redactUrl } from '../src/index.ts';

describe('redactSecrets', () => {
  it('replaces secret-looking fields at any depth and leaves the rest intact', () => {
    const redacted = redactSecrets({
      caption: 'hello',
      headers: { Authorization: 'Bearer abc', 'Content-Type': 'application/json' },
      nested: [{ access_token: 'abc', refreshToken: 'def', media_url: 'https://cdn.example/video.mp4' }],
    });
    expect(redacted).toEqual({
      caption: 'hello',
      headers: { Authorization: '[REDACTED]', 'Content-Type': 'application/json' },
      nested: [{ access_token: '[REDACTED]', refreshToken: '[REDACTED]', media_url: 'https://cdn.example/video.mp4' }],
    });
  });

  it('redacts tokens carried in query strings', () => {
    expect(redactUrl('https://graph.example/me?fields=id&access_token=secret123&x=1')).toBe(
      'https://graph.example/me?fields=id&access_token=[REDACTED]&x=1',
    );
  });
});
