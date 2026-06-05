import { closeStoreForTests } from "../lib/db.ts";
import { assert, assertEquals, assertStringIncludes } from "./asserts.ts";

Deno.env.set("KV_PATH", ":memory:");

const aboutRoute = await import("../routes/about.tsx");
const editRoute = await import("../routes/edit.html.tsx");
const healthRoute = await import("../routes/health.ts");
const dataRoute = await import("../routes/api/data.ts");
const peopleRoute = await import("../routes/api/people.ts");
const auditRoute = await import("../routes/api/audit.ts");
const calRoute = await import("../routes/cal/[token].ics.ts");

function ctx(
  url: string,
  init: RequestInit = {},
  params: Record<string, string> = {},
) {
  const req = new Request(url, init);
  return { req, url: new URL(req.url), params } as never;
}

function routeTest(name: string, fn: () => void | Promise<void>) {
  Deno.test(name, async () => {
    try {
      await fn();
    } finally {
      await closeStoreForTests();
    }
  });
}

routeTest("GET /cal/<token>.ics returns that viewer's calendar", async () => {
  const res = await calRoute.handler.GET(
    ctx("http://localhost/cal/demo-all.ics", {}, { token: "demo-all" }),
  );
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/calendar; charset=utf-8");
  const body = await res.text();
  assertStringIncludes(body, "BEGIN:VCALENDAR");
  assertStringIncludes(body, "END:VCALENDAR");
});

routeTest("scoped token subsets people; unknown token is 404", async () => {
  const dk = await (
    await calRoute.handler.GET(
      ctx("http://localhost/cal/demo-dk.ics", {}, { token: "demo-dk" }),
    )
  ).text();
  assertStringIncludes(dk, "🎂 Mette Dahl");
  assert(
    !dk.includes("🎂 Åse / Mamma"),
    "NO person must be excluded from DK feed",
  );

  const bad = await calRoute.handler.GET(
    ctx("http://localhost/cal/nope.ics", {}, { token: "nope" }),
  );
  assertEquals(bad.status, 404);
  await bad.text();
});

routeTest("GET /api/data returns groups, people and holidays", async () => {
  const res = await dataRoute.handler.GET();
  assertEquals(res.status, 200);
  const data = await res.json();
  assert(Array.isArray(data.people) && data.people.length > 0);
  assert(data.groups && Object.keys(data.groups).length === 2);
  assert(Array.isArray(data.holidays) && data.holidays.length > 0);
});

routeTest(
  "POST /api/people validates and persists, then audit reflects it",
  async () => {
    const res = await peopleRoute.handler.POST(
      ctx("http://localhost/api/people", {
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
    assertEquals(people.length, 1);

    const audit = await (
      await auditRoute.handler.GET(ctx("http://localhost/api/audit"))
    ).json();
    assert(audit.audit.length > 0, "changes should be audited");
    assert(audit.audit.some((a: { action: string }) => a.action === "delete"));
  },
);

routeTest("POST /api/people rejects invalid dates with 400", async () => {
  const res = await peopleRoute.handler.POST(
    ctx("http://localhost/api/people", {
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

routeTest("/about is a zero-JS Fresh page component", () => {
  assertEquals(typeof aboutRoute.default, "function");
});

routeTest("GET /edit.html loads editor data", async () => {
  const result = await editRoute.handlers.GET();
  assert(Array.isArray(result.data.people) && result.data.people.length > 0);
  assert(Array.isArray(result.data.groups) && result.data.groups.length === 2);
});

routeTest("GET /health returns ok", async () => {
  assertEquals(await (await healthRoute.handler.GET()).text(), "ok");
});
