/**
 * In-memory sliding-window rate limiter.
 *
 * US-335: public/portal endpoints need a spam/DoS brake. This is an
 * in-process Map — good enough for a single-node deploy and vastly better
 * than nothing. When we move to multi-region we swap the implementation
 * with an Upstash/Redis-backed version without changing the call sites.
 *
 * Keys are caller-composed (e.g. `portal-scorecard:<ip>:<slug>:<candidate>`).
 * The limiter stores absolute timestamps inside the window and prunes on
 * every call, so memory stays bounded to `limit * activeKeys` entries.
 */

type Bucket = number[];

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed:    boolean;
  remaining:  number;
  retryAfter: number; // seconds until the oldest hit falls out of the window
}

/**
 * Check + record a hit atomically. Returns `allowed: false` when the key
 * has already reached `limit` hits inside `windowMs`.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now     = Date.now();
  const cutoff  = now - windowMs;
  const bucket  = buckets.get(key) ?? [];
  // Drop anything outside the sliding window
  const fresh   = bucket.filter((t) => t > cutoff);

  if (fresh.length >= limit) {
    const oldest = fresh[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    // Write back the pruned bucket so stale timestamps age out
    buckets.set(key, fresh);
    return { allowed: false, remaining: 0, retryAfter };
  }

  fresh.push(now);
  buckets.set(key, fresh);
  return { allowed: true, remaining: limit - fresh.length, retryAfter: 0 };
}

/**
 * Best-effort client IP extraction from Next.js request headers.
 * Falls back to "unknown" so a spoofed/missing header still produces a
 * stable (if shared) bucket key rather than throwing.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

// ─── API Key Rate Limiting (US-084) ──────────────────────────────────────────
//
// Per-key sliding-window quotas with X-RateLimit-* response headers.
// Falls back to in-memory bucketing so callers never fail hard.

/** Requests per minute by scope (most restrictive wins). */
const SCOPE_QUOTA: Record<string, number> = {
  "candidates:read":    60,
  "candidates:write":   30,
  "jobs:read":          60,
  "jobs:write":         30,
  "placements:read":    60,
  "placements:write":   30,
  "clients:read":       60,
  "clients:write":      30,
  "applications:read":  60,
  "applications:write": 30,
  "webhooks:read":      20,
  "webhooks:write":     20,
  "analytics:read":     10,
};

/** In-memory API-key buckets (same Map approach as above). */
const apiKeyBuckets = new Map<string, number[]>();

export interface ApiRateLimitResult {
  allowed:    boolean;
  limit:      number;
  remaining:  number;
  resetAt:    number;   // Unix seconds
  retryAfter: number;   // 0 when allowed
}

/**
 * Check + record a hit for an API key.
 * Uses a 60-second sliding window per key.
 */
export function checkApiKeyRateLimit(
  keyId:  string,
  scopes: string[]
): ApiRateLimitResult {
  const limit = scopes.reduce((min, s) => Math.min(min, SCOPE_QUOTA[s] ?? 60), Infinity);
  const windowMs = 60_000;
  const now      = Date.now();
  const cutoff   = now - windowMs;

  const bucket = apiKeyBuckets.get(keyId) ?? [];
  const fresh  = bucket.filter((t) => t > cutoff);

  const resetAt   = Math.ceil((now + (fresh[0] ? fresh[0] + windowMs - now : windowMs)) / 1000);
  const actualReset = Math.floor((now + windowMs) / 1000);

  if (fresh.length >= limit) {
    const retryAfter = Math.max(1, Math.ceil((fresh[0] + windowMs - now) / 1000));
    apiKeyBuckets.set(keyId, fresh);
    return { allowed: false, limit, remaining: 0, resetAt: actualReset, retryAfter };
  }

  fresh.push(now);
  apiKeyBuckets.set(keyId, fresh);
  return {
    allowed:    true,
    limit,
    remaining:  limit - fresh.length,
    resetAt:    actualReset,
    retryAfter: 0,
  };
}

/**
 * Build standard X-RateLimit-* response headers.
 */
export function rateLimitHeaders(result: ApiRateLimitResult): Record<string, string> {
  const h: Record<string, string> = {
    "X-RateLimit-Limit":     String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset":     String(result.resetAt),
    "X-RateLimit-Policy":    `${result.limit};w=60`,
  };
  if (!result.allowed) {
    h["Retry-After"] = String(result.retryAfter);
  }
  return h;
}
