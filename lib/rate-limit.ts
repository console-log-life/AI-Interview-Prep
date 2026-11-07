import "server-only";

import { RateLimitError } from "@/lib/api/errors";

type Bucket = { count: number; resetAt: number };

/**
 * Fixed-window in-memory limiter.
 *
 * Deliberately simple: it protects the expensive endpoints (AI calls, uploads,
 * code execution) on a single instance without adding Redis to a student
 * project. Swap `buckets` for Redis/Upstash if the app is ever scaled out —
 * the call sites do not change.
 */
const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map cannot grow without bound.
function sweep(now: number) {
  if (buckets.size < 5_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetInSec: number;
};

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetInSec: Math.ceil(windowMs / 1000) };
  }

  existing.count += 1;
  const resetInSec = Math.ceil((existing.resetAt - now) / 1000);
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    resetInSec,
  };
}

/** Throws a 429 when the caller is over budget. */
export function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  message?: string,
): void {
  const result = checkRateLimit(key, limit, windowMs);
  if (!result.allowed) {
    throw new RateLimitError(
      message ??
        `Too many requests. Please try again in ${result.resetInSec} second${
          result.resetInSec === 1 ? "" : "s"
        }.`,
    );
  }
}

/** Test-only helper so limits from one test never leak into the next. */
export function __resetRateLimits(): void {
  buckets.clear();
}
