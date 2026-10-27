import { describe, expect, it } from 'vitest';
import { firstLineOf, stripUrls, truncateToLength } from '../src/index.ts';

describe('truncateToLength', () => {
  it('leaves text within the limit untouched', () => {
    expect(truncateToLength('short', 10)).toBe('short');
  });

  it('cuts at a word boundary and appends an ellipsis, staying within the limit', () => {
    const truncated = truncateToLength('the quick brown fox jumps over the lazy dog', 20);
    expect(truncated).toBe('the quick brown fox…');
    expect(truncated.length).toBeLessThanOrEqual(20);
  });

  it('never splits an emoji, even a multi-codepoint family emoji', () => {
    const family = '👨‍👩‍👧‍👦';
    const truncated = truncateToLength(`${family}${family}${family}`, family.length * 2);
    expect(truncated).toBe(`${family}…`);
  });

  it('handles tiny and zero limits', () => {
    expect(truncateToLength('hello', 0)).toBe('');
    expect(truncateToLength('hello', 1)).toBe('h');
  });
});

describe('stripUrls', () => {
  it('removes links and the whitespace they leave behind', () => {
    expect(stripUrls('New video https://youtu.be/abc out now\nsee www.example.com')).toBe('New video out now\nsee');
  });
});

describe('firstLineOf', () => {
  it('skips leading blank lines', () => {
    expect(firstLineOf('\n\n  Hook line  \nbody')).toBe('Hook line');
  });
});
