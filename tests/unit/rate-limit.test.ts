import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RateLimitError } from "@/lib/api/errors";
import {
  __resetRateLimits,
  checkRateLimit,
  enforceRateLimit,
} from "@/lib/rate-limit";

describe("rate limiting", () => {
  beforeEach(() => {
    __resetRateLimits();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit", () => {
    for (let index = 0; index < 3; index += 1) {
      expect(checkRateLimit("user-1", 3, 60_000).allowed).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit", () => {
    for (let index = 0; index < 3; index += 1) checkRateLimit("user-1", 3, 60_000);
    expect(checkRateLimit("user-1", 3, 60_000).allowed).toBe(false);
  });

  it("keeps a separate budget per key", () => {
    for (let index = 0; index < 3; index += 1) checkRateLimit("user-1", 3, 60_000);
    // A different user must be unaffected by the first user's usage.
    expect(checkRateLimit("user-2", 3, 60_000).allowed).toBe(true);
  });

  it("resets once the window has passed", () => {
    for (let index = 0; index < 3; index += 1) checkRateLimit("user-1", 3, 60_000);
    expect(checkRateLimit("user-1", 3, 60_000).allowed).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect(checkRateLimit("user-1", 3, 60_000).allowed).toBe(true);
  });

  it("reports how many requests remain", () => {
    expect(checkRateLimit("user-1", 5, 60_000).remaining).toBe(4);
    expect(checkRateLimit("user-1", 5, 60_000).remaining).toBe(3);
  });

  it("never reports negative remaining requests", () => {
    for (let index = 0; index < 10; index += 1) checkRateLimit("user-1", 2, 60_000);
    expect(checkRateLimit("user-1", 2, 60_000).remaining).toBe(0);
  });

  it("throws a typed 429 when the budget is exhausted", () => {
    enforceRateLimit("user-1", 1, 60_000);
    expect(() => enforceRateLimit("user-1", 1, 60_000)).toThrow(RateLimitError);

    try {
      enforceRateLimit("user-1", 1, 60_000);
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).status).toBe(429);
      // The message must be actionable, not a raw internal error.
      expect((error as RateLimitError).message).toMatch(/try again/i);
    }
  });

  it("does not throw while inside the budget", () => {
    expect(() => enforceRateLimit("user-1", 3, 60_000)).not.toThrow();
    expect(() => enforceRateLimit("user-1", 3, 60_000)).not.toThrow();
  });
});
