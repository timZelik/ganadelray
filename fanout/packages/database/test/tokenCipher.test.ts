import { testEncryptionKey } from '@fanout/testing';
import { describe, expect, it } from 'vitest';
import { createTokenCipher } from '../src/index.ts';

const tokenSet = { accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresAt: new Date('2026-12-01T00:00:00Z'), tokenType: 'Bearer' };

describe('createTokenCipher', () => {
  it('round-trips a token set, including dates', () => {
    const cipher = createTokenCipher(testEncryptionKey);
    expect(cipher.decrypt(cipher.encrypt(tokenSet))).toEqual(tokenSet);
  });

  it('never produces the same ciphertext twice and never contains the plaintext', () => {
    const cipher = createTokenCipher(testEncryptionKey);
    const first = cipher.encrypt(tokenSet);
    expect(cipher.encrypt(tokenSet)).not.toBe(first);
    expect(first).not.toContain('secret');
    expect(first.startsWith('v1:')).toBe(true);
  });

  it('detects tampering and wrong keys through the GCM authentication tag', () => {
    const cipher = createTokenCipher(testEncryptionKey);
    const [version, initializationVector, tag, ciphertext] = cipher.encrypt(tokenSet).split(':');
    const flipped = Buffer.from(ciphertext!, 'base64');
    flipped[0] = flipped[0]! ^ 1;
    expect(() => cipher.decrypt([version, initializationVector, tag, flipped.toString('base64')].join(':'))).toThrow();
    expect(() => createTokenCipher(Buffer.alloc(32, 1).toString('base64')).decrypt(cipher.encrypt(tokenSet))).toThrow();
  });

  it('rejects keys of the wrong length', () => {
    expect(() => createTokenCipher(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
