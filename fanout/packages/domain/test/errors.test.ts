import { describe, expect, it } from 'vitest';
import { classifyError, PermanentError, ReauthRequiredError, RetryableError } from '../src/index.ts';

describe('classifyError', () => {
  it('reads the kind of typed pipeline errors', () => {
    expect(classifyError(new RetryableError('rate limited', { retryAfterMilliseconds: 5000 }))).toBe('retryable');
    expect(classifyError(new PermanentError('bad video'))).toBe('permanent');
    expect(classifyError(new ReauthRequiredError('token expired', { connectionId: 'connection-1' }))).toBe('reauth_required');
  });

  it('treats unknown errors as retryable so bugs do not silently drop posts', () => {
    expect(classifyError(new Error('boom'))).toBe('retryable');
    expect(classifyError('string thrown')).toBe('retryable');
  });

  it('keeps the subclass name for logs', () => {
    expect(new ReauthRequiredError('expired').name).toBe('ReauthRequiredError');
  });
});
