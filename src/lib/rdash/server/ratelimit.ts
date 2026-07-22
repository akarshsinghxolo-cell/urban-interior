/**
 * In-memory sliding-window rate limiter.
 *
 * LIMITATION: This is in-memory and therefore per-instance. On Vercel
 * serverless (multiple lambda instances), each instance has its own counter,
 * so the effective limit is multiplied by the number of warm instances.
 * For production-grade rate limiting, replace the store with Vercel KV
 * or Upstash Redis (@upstash/ratelimit). The interface stays the same.
 *
 * Usage:
 *   import { rateLimit } from "@/lib/rdash/server/ratelimit";
 *   const { ok, retryAfterSec } = rateLimit(`login:${email}`, 5, 15 * 60);
 *   if (!ok) return NextResponse.json({ error: "Too many attempts." }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
 */

type Bucket = {
  timestamps: number[];
};

const store = new Map<string, Bucket>();

// Periodic cleanup of expired buckets (every 5 minutes).
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(now: number, windowSec: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - windowSec * 1000;
  for (const [key, bucket] of store) {
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
    if (bucket.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

/**
 * Check rate limit for a given key.
 *
 * @param key        Identifier (e.g. `login:user@example.com`, `signup:1.2.3.4`)
 * @param maxAttempts Maximum attempts allowed in the window
 * @param windowSec   Window size in seconds
 * @returns           `{ ok: false, retryAfterSec }` if rate-limited, `{ ok: true }` otherwise
 */
export function rateLimit(
  key: string,
  maxAttempts: number,
  windowSec: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  cleanup(now, windowSec);

  const bucket = store.get(key) ?? { timestamps: [] };
  const windowStart = now - windowSec * 1000;

  // Keep only timestamps within the window
  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);

  if (bucket.timestamps.length >= maxAttempts) {
    const oldest = Math.min(...bucket.timestamps);
    const retryAfterSec = Math.ceil((oldest + windowSec * 1000 - now) / 1000);
    store.set(key, bucket);
    return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  bucket.timestamps.push(now);
  store.set(key, bucket);
  return { ok: true };
}

/** Extract a best-effort client IP from a Next.js request. */
export function clientIp(request: { headers: Headers }): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
