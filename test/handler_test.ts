import { closeStoreForTests } from "../lib/db.ts";
import { assert, assertEquals, assertStringIncludes } from "./asserts.ts";

Deno.env.set("KV_PATH", ":memory:");

const aboutRoute = await import("../routes/about.tsx");
const healthRoute = await import("../routes/health.ts");
const viewRoute = await import("../routes/view/[token].tsx");
const editRoute = await import("../routes/edit/[token].tsx");
const dataRoute = await import("../routes/api/data/[token].ts");
const peopleRoute = await import("../routes/api/people/[token].ts");
const auditRoute = await import("../routes/api/audit/[token].ts");
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

routeTest("GET /api/data/<token> scopes data and rejects unknown tokens", async () => {
  const res = await dataRoute.handler.GET(
    ctx("http://localhost/api/data/demo-dk", {}, { token: "demo-dk" }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assert(Array.isArray(data.people) && data.people.length > 0);
  assert(data.people.every((person: { group: string }) => person.group === "dk"));
  assert(data.groups && Object.keys(data.groups).length === 2);
  assert(Array.isArray(data.holidays) && data.holidays.length > 0);

  const bad = await dataRoute.handler.GET(
    ctx("http://localhost/api/data/nope", {}, { token: "nope" }),
  );
  assertEquals(bad.status, 404);
});

routeTest(
  "editor token persists and attributes changes, read token cannot write",
  async () => {
    const denied = await peopleRoute.handler.POST(
      ctx(
        "http://localhost/api/people/demo-all",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ people: [] }),
        },
        { token: "demo-all" },
      ),
    );
    assertEquals(denied.status, 404);

    const res = await peopleRoute.handler.POST(
      ctx(
        "http://localhost/api/people/demo-edit",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
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
        },
        { token: "demo-edit" },
      ),
    );
    assertEquals(res.status, 200);
    const { people } = await res.json();
    assertEquals(people.length, 1);

    const audit = await (
      await auditRoute.handler.GET(
        ctx("http://localhost/api/audit/demo-edit", {}, { token: "demo-edit" }),
      )
    ).json();
    assert(audit.audit.length > 0, "changes should be audited");
    assert(audit.audit.some((a: { action: string }) => a.action === "delete"));
    assert(audit.audit.every((a: { actor: string }) => a.actor === "Family editor"));
  },
);

routeTest("POST /api/people rejects invalid dates with 400", async () => {
  const res = await peopleRoute.handler.POST(
    ctx(
      "http://localhost/api/people/demo-edit",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          people: [{ name: "Bad", born: "13-40-99" }],
        }),
      },
      { token: "demo-edit" },
    ),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assert(typeof body.error === "string");
});

routeTest("PATCH /api/people updates one person for editor tokens", async () => {
  const res = await peopleRoute.handler.PATCH(
    ctx(
      "http://localhost/api/people/demo-edit",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "solveig",
          person: {
            name: "Solveig Updated",
            born: "1992-05-13",
            died: null,
            groups: ["no"],
            notes: "Updated inline",
          },
        }),
      },
      { token: "demo-edit" },
    ),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).person.name, "Solveig Updated");
});

routeTest("/about is a zero-JS Fresh page component", () => {
  assertEquals(typeof aboutRoute.default, "function");
});

routeTest("private calendar and editor pages enforce viewer capabilities", async () => {
  const calendar = await viewRoute.handlers.GET(
    ctx("http://localhost/view/demo-dk", {}, { token: "demo-dk" }),
  );
  assert(!(calendar instanceof Response));
  assert(calendar.data.calendar.people.every((person) => person.group === "dk"));
  assertEquals(calendar.data.editUrl, undefined);

  const result = await editRoute.handlers.GET(
    ctx("http://localhost/edit/demo-edit", {}, { token: "demo-edit" }),
  );
  assert(!(result instanceof Response));
  assert(Array.isArray(result.data.people) && result.data.people.length > 0);
  assert(Array.isArray(result.data.groups) && result.data.groups.length === 2);
  assertEquals(result.data.viewer.name, "Family editor");

  const denied = await editRoute.handlers.GET(
    ctx("http://localhost/edit/demo-all", {}, { token: "demo-all" }),
  );
  assert(denied instanceof Response);
  assertEquals(denied.status, 404);
});

routeTest("GET /health returns ok", async () => {
  assertEquals(await (await healthRoute.handler.GET()).text(), "ok");
});
