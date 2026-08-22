// A small fixed-window rate limiter, kept in process memory.
//
// Scope note, stated plainly because it matters: this protects ONE server instance. On
// serverless (Vercel), each cold instance gets its own counter, so a determined caller
// spread across instances gets more than the nominal limit. That's an accepted tradeoff
// for a portfolio-stage app — it stops the realistic failure (one browser tab hammering
// the endpoint and burning API credits) with zero infrastructure. A production version
// would move this to Redis/Upstash, and the interface below wouldn't have to change.

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  /** Seconds until the current window resets. Suitable for a Retry-After header. */
  retryAfter: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Bound the map so a flood of distinct keys can't grow it without limit.
const MAX_TRACKED_KEYS = 10_000;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    if (buckets.size >= MAX_TRACKED_KEYS) pruneExpired(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.max(0, Math.ceil((existing.resetAt - now) / 1000));

  if (existing.count > limit) {
    return { ok: false, remaining: 0, retryAfter };
  }
  return { ok: true, remaining: Math.max(0, limit - existing.count), retryAfter };
}

function pruneExpired(now: number) {
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k);
  }
  // Still full of live entries? Drop the oldest-resetting ones to stay bounded.
  if (buckets.size >= MAX_TRACKED_KEYS) {
    const sorted = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [k] of sorted.slice(0, Math.floor(MAX_TRACKED_KEYS / 2))) buckets.delete(k);
  }
}

/** Test seam — lets tests start from a clean slate. */
export function __resetRateLimits() {
  buckets.clear();
}

/**
 * Best-effort client identity. Behind Vercel/most proxies the real client is the FIRST
 * entry in x-forwarded-for; the rest are proxy hops. Falls back to a shared bucket, which
 * degrades to a global limit rather than to no limit at all.
 */
export function clientKey(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
