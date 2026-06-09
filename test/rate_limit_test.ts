import { clientKey, RateLimiter } from "../lib/rate_limit.ts";
import { assert, assertEquals } from "./asserts.ts";

Deno.test("RateLimiter allows up to max hits then blocks within a window", () => {
  const limiter = new RateLimiter({ windowMs: 1000, max: 3 });
  const t0 = 10_000;
  assertEquals(limiter.check("a", t0).allowed, true);
  assertEquals(limiter.check("a", t0 + 1).allowed, true);
  assertEquals(limiter.check("a", t0 + 2).allowed, true);
  const blocked = limiter.check("a", t0 + 3);
  assertEquals(blocked.allowed, false);
  assert(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 1000);
});

Deno.test("RateLimiter resets after the window and isolates keys", () => {
  const limiter = new RateLimiter({ windowMs: 1000, max: 1 });
  const t0 = 0;
  assertEquals(limiter.check("a", t0).allowed, true);
  assertEquals(limiter.check("a", t0 + 500).allowed, false);
  // Different key has its own bucket.
  assertEquals(limiter.check("b", t0 + 500).allowed, true);
  // After the window, the original key is allowed again.
  assertEquals(limiter.check("a", t0 + 1000).allowed, true);
});

Deno.test("clientKey prefers the first X-Forwarded-For hop", () => {
  const req = new Request("http://x/", {
    headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
  });
  assertEquals(clientKey(req), "203.0.113.7");
});

Deno.test("clientKey falls back to the socket address, then unknown", () => {
  const req = new Request("http://x/");
  assertEquals(
    clientKey(req, { remoteAddr: { transport: "tcp", hostname: "198.51.100.4", port: 5 } }),
    "198.51.100.4",
  );
  assertEquals(clientKey(req), "unknown");
});
