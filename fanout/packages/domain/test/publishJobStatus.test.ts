import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, isRetryable, statusesThatCanTransitionTo, PermanentError } from '../src/index.ts';

describe('publish job status machine', () => {
  it('follows the happy path queued → preparing → publishing → processing → published', () => {
    expect(canTransition('queued', 'preparing')).toBe(true);
    expect(canTransition('preparing', 'publishing')).toBe(true);
    expect(canTransition('publishing', 'processing')).toBe(true);
    expect(canTransition('processing', 'published')).toBe(true);
  });

  it('never leaves published', () => {
    expect(statusesThatCanTransitionTo('queued')).not.toContain('published');
    expect(() => assertTransition('published', 'queued')).toThrow(PermanentError);
  });

  it('allows retrying only failed or skipped jobs', () => {
    expect(isRetryable('failed')).toBe(true);
    expect(isRetryable('skipped')).toBe(true);
    expect(isRetryable('publishing')).toBe(false);
    expect(statusesThatCanTransitionTo('queued').sort()).toEqual(['failed', 'preparing', 'publishing', 'skipped']);
  });
});
