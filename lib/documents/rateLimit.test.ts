import { describe, expect, it } from "vitest";
import { createInMemoryRateLimiter } from "./rateLimit";

describe("createInMemoryRateLimiter", () => {
  it("allows up to maxAttempts within the window, then blocks", () => {
    const limiter = createInMemoryRateLimiter({
      maxAttempts: 3,
      windowMs: 60_000,
    });
    const now = new Date("2026-11-01T08:00:00Z");

    expect(limiter.check("tok-1", now)).toBe(true);
    expect(limiter.check("tok-1", now)).toBe(true);
    expect(limiter.check("tok-1", now)).toBe(true);
    expect(limiter.check("tok-1", now)).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = createInMemoryRateLimiter({
      maxAttempts: 1,
      windowMs: 60_000,
    });
    const now = new Date("2026-11-01T08:00:00Z");

    expect(limiter.check("tok-1", now)).toBe(true);
    expect(limiter.check("tok-2", now)).toBe(true);
    expect(limiter.check("tok-1", now)).toBe(false);
  });

  it("forgets attempts once they age out of the window", () => {
    const limiter = createInMemoryRateLimiter({
      maxAttempts: 1,
      windowMs: 60_000,
    });
    const t0 = new Date("2026-11-01T08:00:00Z");
    const later = new Date(t0.getTime() + 61_000);

    expect(limiter.check("tok-1", t0)).toBe(true);
    expect(limiter.check("tok-1", t0)).toBe(false);
    expect(limiter.check("tok-1", later)).toBe(true);
  });
});
