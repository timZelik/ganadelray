export type RateLimitScope = 'connection' | 'platform';

export interface RateLimitWindow {
  scope: RateLimitScope;
  maximumOperations: number;
  windowMilliseconds: number;
}

/** Declared by every adapter; enforced by the queue per connection and globally per platform. */
export interface RateLimitPolicy {
  /** Key shared by all connections of one platform, e.g. "buffer" or "instagram". */
  platformKey: string;
  windows: readonly RateLimitWindow[];
}

const hour = 60 * 60 * 1000;
export const oneDayInMilliseconds = 24 * hour;

export function unlimitedRateLimitPolicy(platformKey: string): RateLimitPolicy {
  return { platformKey, windows: [] };
}
