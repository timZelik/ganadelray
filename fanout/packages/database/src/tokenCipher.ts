import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { TokenSet } from '@fanout/domain';
import { z } from 'zod';

const algorithm = 'aes-256-gcm';
const formatVersion = 'v1';
const initializationVectorBytes = 12;

const tokenSetSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  expiresAt: z.coerce.date().nullable(),
  tokenType: z.string().nullable(),
});

export interface TokenCipher {
  encrypt(tokenSet: TokenSet): string;
  decrypt(ciphertext: string): TokenSet;
}

/** AES-256-GCM with a random IV per message; the format is versioned so keys can be rotated later. */
export function createTokenCipher(base64Key: string): TokenCipher {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('Token encryption key must be 32 bytes');
  return {
    encrypt(tokenSet) {
      const initializationVector = randomBytes(initializationVectorBytes);
      const cipher = createCipheriv(algorithm, key, initializationVector);
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokenSet), 'utf8'), cipher.final()]);
      return [formatVersion, initializationVector, cipher.getAuthTag(), ciphertext].map((part) => (typeof part === 'string' ? part : part.toString('base64'))).join(':');
    },
    decrypt(serialized) {
      const [version, initializationVector, authenticationTag, ciphertext] = serialized.split(':');
      if (version !== formatVersion || !initializationVector || !authenticationTag || !ciphertext) throw new Error('Unrecognized token ciphertext format');
      const decipher = createDecipheriv(algorithm, key, Buffer.from(initializationVector, 'base64'));
      decipher.setAuthTag(Buffer.from(authenticationTag, 'base64'));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
      return tokenSetSchema.parse(JSON.parse(plaintext));
    },
  };
}
