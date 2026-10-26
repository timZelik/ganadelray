import type { Redis } from 'ioredis';

export interface RateLimitRule {
  /** e.g. "platform:buffer" or "connection:<uuid>". */
  key: string;
  maximumOperations: number;
  windowMilliseconds: number;
}

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterMilliseconds: number };

/**
 * Sliding-window log over sorted sets, all rules checked and claimed atomically:
 * either every window has room and the operation is counted in all of them, or none is touched.
 * Returns 0 when allowed, otherwise the milliseconds until the tightest window frees a slot.
 */
const acquireScript = `
local now = tonumber(ARGV[1])
local member = ARGV[2]
local waitMilliseconds = 0
for index, key in ipairs(KEYS) do
  local maximum = tonumber(ARGV[1 + index * 2])
  local window = tonumber(ARGV[2 + index * 2])
  redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
  if redis.call('ZCARD', key) >= maximum then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    waitMilliseconds = math.max(waitMilliseconds, tonumber(oldest[2]) + window - now)
  end
end
if waitMilliseconds > 0 then return waitMilliseconds end
for index, key in ipairs(KEYS) do
  local window = tonumber(ARGV[2 + index * 2])
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
end
return 0
`;

const keyPrefix = 'fanout:rate-limit:';

export interface RateLimiter {
  acquire(rules: readonly RateLimitRule[], operationId: string, now?: number): Promise<RateLimitDecision>;
}

export function createRateLimiter(redis: Redis): RateLimiter {
  return {
    async acquire(rules, operationId, now = Date.now()) {
      if (rules.length === 0) return { allowed: true };
      const keys = rules.map((rule) => `${keyPrefix}${rule.key}`);
      const limits = rules.flatMap((rule) => [String(rule.maximumOperations), String(rule.windowMilliseconds)]);
      const waitMilliseconds = Number(await redis.eval(acquireScript, keys.length, ...keys, String(now), `${now}-${operationId}`, ...limits));
      return waitMilliseconds === 0 ? { allowed: true } : { allowed: false, retryAfterMilliseconds: Math.ceil(waitMilliseconds) };
    },
  };
}
