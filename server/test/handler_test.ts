import { createHandler } from "../src/handler.ts";
import { SeedStore } from "../src/store.ts";
import { assert, assertEquals, assertStringIncludes } from "./asserts.ts";

const handler = createHandler(new SeedStore());

Deno.test("GET /calendar.ics returns a calendar with the right content type", async () => {
  const res = await handler(new Request("http://localhost/calendar.ics"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/calendar; charset=utf-8");
  const body = await res.text();
  assertStringIncludes(body, "BEGIN:VCALENDAR");
  assertStringIncludes(body, "END:VCALENDAR");
});

Deno.test("GET / serves the landing page with the feed URL", async () => {
  const res = await handler(new Request("http://localhost/"));
  assertEquals(res.status, 200);
  assertStringIncludes(res.headers.get("content-type") ?? "", "text/html");
  const body = await res.text();
  assertStringIncludes(body, "http://localhost/calendar.ics");
});

Deno.test("GET /health returns ok", async () => {
  const res = await handler(new Request("http://localhost/health"));
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "ok");
});

Deno.test("unknown route returns 404", async () => {
  const res = await handler(new Request("http://localhost/nope"));
  assertEquals(res.status, 404);
  // Drain body to avoid leaking the response stream in the test runner.
  await res.text();
});

Deno.test("POST to feed is not matched (GET-only)", async () => {
  const res = await handler(new Request("http://localhost/calendar.ics", { method: "POST" }));
  assertEquals(res.status, 404);
  await res.text();
  assert(true);
});
