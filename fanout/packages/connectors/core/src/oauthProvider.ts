import type { Platform, TokenSet } from '@fanout/domain';

export interface OAuthProvider {
  readonly platform: Platform;
  readonly usesPkce: boolean;
  buildAuthorizationUrl(state: string, codeVerifier?: string): URL;
  exchangeCode(code: string, codeVerifier?: string): Promise<TokenSet>;
  refresh(tokenSet: TokenSet): Promise<TokenSet>;
}
