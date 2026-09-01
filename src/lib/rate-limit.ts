/**
 * A fixed-window, in-process rate limiter.
 *
 * The chat route spends money on every call (an OpenAI completion plus OpenSea
 * MCP tool calls), so an unbounded request rate is a billing problem, not just
 * a load problem. This keeps the sample dependency-free and correct for a
 * single instance.
 *
 * Known limitation, stated rather than hidden: the counter lives in process
 * memory. Behind more than one instance, or on a platform that recycles the
 * function between requests, the effective limit is per-instance and resets on
 * a cold start. For a real deployment back this with a shared store (Redis,
 * Upstash, Vercel KV) keyed the same way.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

/** Bound the map so a flood of distinct keys cannot grow it without limit. */
const MAX_TRACKED_KEYS = 10_000;

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export type RateLimitResult = {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** Seconds until the window resets, for a `Retry-After` header. */
  retryAfterSeconds: number;
};

/**
 * Drop windows that have already expired.
 *
 * Called on each check, which is cheap at this scale and means we never hold
 * entries for callers that stopped sending traffic.
 */
function evictExpired(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export function checkRateLimit(key: string, now = Date.now()): RateLimitResult {
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) evictExpired(now);
    // Still full after eviction means every tracked window is live. Refuse the
    // new key rather than letting the map grow: failing closed here throttles a
    // key-flooding caller instead of exhausting memory.
    if (windows.size >= MAX_TRACKED_KEYS) {
      return { allowed: false, remaining: 0, retryAfterSeconds: WINDOW_MS / 1000 };
    }
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return {
      allowed: true,
      remaining: MAX_REQUESTS_PER_WINDOW - 1,
      retryAfterSeconds: 0,
    };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - existing.count,
    retryAfterSeconds,
  };
}

/**
 * Derive a rate-limit key from the request.
 *
 * `x-forwarded-for` is client-controlled unless a trusted proxy overwrites it,
 * so this is a best-effort bucket and not an identity. When a shared access
 * token is configured, prefer keying on that instead; see the route handler.
 */
export function rateLimitKeyFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return `ip:${first}`;

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return `ip:${realIp}`;

  return "ip:unknown";
}

/** Exposed for tests and for callers that want to reason about the budget. */
export const rateLimitConfig = {
  windowMs: WINDOW_MS,
  maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
} as const;
