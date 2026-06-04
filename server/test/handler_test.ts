import { createHandler } from "../src/handler.ts";
import { SeedStore } from "../src/store.ts";
import { assert, assertEquals, assertStringIncludes } from "./asserts.ts";

// Serve static files from a throwaway dir so tests don't depend on repo layout.
const webRoot = new URL(`file://${await Deno.makeTempDir()}/`);
await Deno.writeTextFile(
  new URL("index.html", webRoot),
  "<!doctype html><title>cal</title>",
);
await Deno.writeTextFile(
  new URL("edit.html", webRoot),
  "<!doctype html><title>edit</title>",
);

function handlerWith() {
  return createHandler({ store: new SeedStore(), webRoot });
}

Deno.test("GET /cal/<token>.ics returns that viewer's calendar", async () => {
  const handler = handlerWith();
  const res = await handler(new Request("http://localhost/cal/demo-all.ics"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/calendar; charset=utf-8");
  const body = await res.text();
  assertStringIncludes(body, "BEGIN:VCALENDAR");
  assertStringIncludes(body, "END:VCALENDAR");
});

Deno.test("scoped token subsets people; unknown token is 404", async () => {
  const handler = handlerWith();
  const dk = await (
    await handler(new Request("http://localhost/cal/demo-dk.ics"))
  ).text();
  assertStringIncludes(dk, "🎂 Mette Dahl");
  assert(
    !dk.includes("🎂 Åse / Mamma"),
    "NO person must be excluded from DK feed",
  );

  const bad = await handler(new Request("http://localhost/cal/nope.ics"));
  assertEquals(bad.status, 404);
  await bad.text();
});

Deno.test("GET /api/data returns groups and people", async () => {
  const handler = handlerWith();
  const res = await handler(new Request("http://localhost/api/data"));
  assertEquals(res.status, 200);
  const data = await res.json();
  assert(Array.isArray(data.people) && data.people.length > 0);
  assert(Array.isArray(data.groups) && data.groups.length === 2);
});

Deno.test(
  "POST /api/people validates and persists, then /api/data reflects it",
  async () => {
    const store = new SeedStore();
    const handler = createHandler({ store, webRoot });

    const res = await handler(
      new Request("http://localhost/api/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actor: "Halvor",
          people: [
            {
              id: "solveig",
              name: "Solveig",
              born: "1992-05-13",
              groups: ["no"],
              notes: "",
            },
          ],
        }),
      }),
    );
    assertEquals(res.status, 200);
    const { people } = await res.json();
    assertEquals(people.length, 1); // everyone else was removed by the full replace

    const audit = await (
      await handler(new Request("http://localhost/api/audit"))
    ).json();
    assert(audit.audit.length > 0, "changes should be audited");
    assert(audit.audit.some((a: { action: string }) => a.action === "delete"));
  },
);

Deno.test("POST /api/people rejects invalid dates with 400", async () => {
  const handler = handlerWith();
  const res = await handler(
    new Request("http://localhost/api/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor: "x",
        people: [{ name: "Bad", born: "13-40-99" }],
      }),
    }),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assert(typeof body.error === "string");
});

Deno.test("GET / serves the web app index", async () => {
  const handler = handlerWith();
  const res = await handler(new Request("http://localhost/"));
  assertEquals(res.status, 200);
  assertStringIncludes(res.headers.get("content-type") ?? "", "text/html");
  assertStringIncludes(await res.text(), "<title>cal</title>");
});

Deno.test("GET /health returns ok; unknown route 404", async () => {
  const handler = handlerWith();
  assertEquals(
    await (await handler(new Request("http://localhost/health"))).text(),
    "ok",
  );
  const res = await handler(new Request("http://localhost/nope"));
  assertEquals(res.status, 404);
  await res.text();
});
