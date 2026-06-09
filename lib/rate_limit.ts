/**
 * Tiny in-memory fixed-window rate limiter. Pragmatic for a single-family,
 * single-instance deployment: it bounds abuse of unauthenticated endpoints
 * (e.g. invite redemption) without a datastore. Counters reset on restart and
 * are per-instance, which is fine at this scale.
 */

export interface RateLimitRule {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max allowed hits per key within a window. */
  max: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the window resets (0 when allowed with room to spare). */
  retryAfterMs: number;
}

export class RateLimiter {
  #rule: RateLimitRule;
  #windows = new Map<string, Window>();

  constructor(rule: RateLimitRule) {
    this.#rule = rule;
  }

  /** Record a hit for `key` and report whether it is within the limit. */
  check(key: string, now: number = Date.now()): RateLimitResult {
    this.#prune(now);
    const win = this.#windows.get(key);
    if (!win || now >= win.resetAt) {
      this.#windows.set(key, { count: 1, resetAt: now + this.#rule.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (win.count >= this.#rule.max) {
      return { allowed: false, retryAfterMs: win.resetAt - now };
    }
    win.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Drop expired windows so the map can't grow without bound. */
  #prune(now: number): void {
    if (this.#windows.size < 1024) return;
    for (const [key, win] of this.#windows) {
      if (now >= win.resetAt) this.#windows.delete(key);
    }
  }
}

/** Best-effort client key: first X-Forwarded-For hop, else the socket address. */
export function clientKey(req: Request, info?: { remoteAddr?: Deno.Addr }): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const addr = info?.remoteAddr;
  if (addr && (addr.transport === "tcp" || addr.transport === "udp")) {
    return addr.hostname;
  }
  return "unknown";
}
