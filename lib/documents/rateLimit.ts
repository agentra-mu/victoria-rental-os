/**
 * Simple in-memory sliding-window rate limiter for the upload endpoint
 * (prompts/07-secure-document-upload-page.md: "rate-limit the endpoints per
 * token and per IP"). State lives in process memory, so on Vercel this
 * limits per warm serverless instance, not globally — good enough to blunt
 * a careless retry loop or a single abusive client for this MVP; a shared
 * store (e.g. Upstash Redis) would be needed for a real global limit, but
 * that's new infra with its own env vars, out of scope here.
 */
export interface RateLimiter {
  /** Records one attempt for `key` and returns whether it's still within the limit. */
  check(key: string, now: Date): boolean;
}

export function createInMemoryRateLimiter(opts: {
  maxAttempts: number;
  windowMs: number;
}): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    check(key, now) {
      const nowMs = now.getTime();
      const windowStart = nowMs - opts.windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);

      if (recent.length >= opts.maxAttempts) {
        hits.set(key, recent);
        return false;
      }

      recent.push(nowMs);
      hits.set(key, recent);
      return true;
    },
  };
}
