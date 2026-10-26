export interface BackoffSettings {
  baseDelayMilliseconds: number;
  maximumDelayMilliseconds: number;
}

/** Parses Retry-After as delta-seconds or an HTTP date. */
export function parseRetryAfterMilliseconds(headerValue: string | null, now: number = Date.now()): number | null {
  if (headerValue === null || headerValue.trim() === '') return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const retryAt = Date.parse(headerValue);
  return Number.isNaN(retryAt) ? null : Math.max(0, retryAt - now);
}

/** Exponential backoff with full jitter; `randomFraction` is injectable for deterministic tests. */
export function computeBackoffMilliseconds(attemptNumber: number, settings: BackoffSettings, randomFraction: number = Math.random()): number {
  const exponentialCeiling = Math.min(settings.maximumDelayMilliseconds, settings.baseDelayMilliseconds * 2 ** (attemptNumber - 1));
  return Math.round(exponentialCeiling * randomFraction);
}
