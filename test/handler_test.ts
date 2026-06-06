import { closeStoreForTests, getStore } from "../lib/db.ts";
import { assert, assertEquals, assertStringIncludes } from "./asserts.ts";
import { populateTestStore, TEST_GROUPS } from "./fixtures.ts";

Deno.env.set("KV_PATH", ":memory:");

const aboutRoute = await import("../routes/about.tsx");
const healthRoute = await import("../routes/health.ts");
const viewRoute = await import("../routes/view/[token].tsx");
const adminRoute = await import("../routes/admin/index.tsx");
const adminAuditRoute = await import("../routes/admin/audit/index.tsx");
const adminGroupsRoute = await import("../routes/admin/groups/index.tsx");
const adminPeopleRoute = await import("../routes/admin/people/index.tsx");
const adminViewersRoute = await import("../routes/admin/viewers/index.tsx");
const dataRoute = await import("../routes/api/data/[token].ts");
const peopleRoute = await import("../routes/api/people/[token].ts");
const auditRoute = await import("../routes/api/audit/[token].ts");
const calRoute = await import("../routes/cal/[token].ics.ts");
const main = await import("../main.ts");

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
      await populateTestStore(await getStore());
      await fn();
    } finally {
      await closeStoreForTests();
    }
  });
}

routeTest("GET /cal/<token>.ics returns that viewer's calendar", async () => {
  const res = await calRoute.handler.GET(
    ctx("http://localhost/cal/view-all.ics", {}, { token: "view-all" }),
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
      ctx("http://localhost/cal/view-dk.ics", {}, { token: "view-dk" }),
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
    ctx("http://localhost/api/data/view-dk", {}, { token: "view-dk" }),
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
        "http://localhost/api/people/view-all",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ people: [] }),
        },
        { token: "view-all" },
      ),
    );
    assertEquals(denied.status, 404);

    const res = await peopleRoute.handler.POST(
      ctx(
        "http://localhost/api/people/editor",
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
        { token: "editor" },
      ),
    );
    assertEquals(res.status, 200);
    const { people } = await res.json();
    assertEquals(people.length, 1);

    const audit = await (
      await auditRoute.handler.GET(
        ctx("http://localhost/api/audit/editor", {}, { token: "editor" }),
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
      "http://localhost/api/people/editor",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          people: [{ name: "Bad", born: "13-40-99" }],
        }),
      },
      { token: "editor" },
    ),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assert(typeof body.error === "string");
});

routeTest("PATCH /api/people updates one person for editor tokens", async () => {
  const res = await peopleRoute.handler.PATCH(
    ctx(
      "http://localhost/api/people/editor",
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
      { token: "editor" },
    ),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).person.name, "Solveig Updated");
});

routeTest("/about is a zero-JS Fresh page component", () => {
  assertEquals(typeof aboutRoute.default, "function");
});

routeTest("private calendar and admin pages enforce viewer capabilities", async () => {
  const calendar = await viewRoute.handlers.GET(
    ctx("http://localhost/view/view-dk", {}, { token: "view-dk" }),
  );
  assert(!(calendar instanceof Response));
  assert(calendar.data.calendar.people.every((person) => person.group === "dk"));
  assertEquals(calendar.data.editUrl, undefined);

  const entry = await adminRoute.handlers.GET(
    ctx("http://localhost/admin/?token=editor"),
  );
  assert(entry instanceof Response);
  assertEquals(entry.status, 303);
  const cookie = entry.headers.get("set-cookie");
  assert(cookie);

  const result = await adminPeopleRoute.handlers.GET(
    ctx("http://localhost/admin/people/", { headers: { cookie } }),
  );
  assert(!(result instanceof Response));
  assert(Array.isArray(result.data.people) && result.data.people.length > 0);
  assert(Array.isArray(result.data.groups) && result.data.groups.length === 2);
  assertEquals(result.data.viewer.name, "Family editor");

  for (
    const [route, path] of [
      [adminGroupsRoute, "groups"],
      [adminViewersRoute, "viewers"],
      [adminAuditRoute, "audit"],
    ] as const
  ) {
    const page = await route.handlers.GET(
      ctx(`http://localhost/admin/${path}/`, { headers: { cookie } }),
    );
    assert(!(page instanceof Response));
    assertEquals(page.data.viewer.name, "Family editor");
  }

  const groupForm = new FormData();
  for (const group of TEST_GROUPS) {
    groupForm.append("key", group.key);
    groupForm.append("label", group.label);
    groupForm.append("flag", group.flag);
  }
  const groupSave = await adminGroupsRoute.handlers.POST(
    ctx("http://localhost/admin/groups/", {
      method: "POST",
      headers: { cookie },
      body: groupForm,
    }),
  );
  assertEquals(groupSave.status, 303);
  assertEquals(groupSave.headers.get("location"), "/admin/groups/?saved=1");

  const denied = await adminRoute.handlers.GET(
    ctx("http://localhost/admin/?token=view-all"),
  ).then(
    () => null,
    (error) => error,
  );
  assert(denied instanceof Error);
  assertEquals((denied as Error & { status: number }).status, 404);
});

routeTest("expired capabilities return a specific expired response", async () => {
  const store = await getStore();
  await store.upsertViewer({
    token: "expired",
    name: "Expired viewer",
    groups: [],
    canEdit: true,
    expiredAt: "2026-06-06T12:00:00Z",
  });

  const data = await dataRoute.handler.GET(
    ctx("http://localhost/api/data/expired", {}, { token: "expired" }),
  );
  assertEquals(data.status, 410);
  assertStringIncludes((await data.json()).error, "expired");

  const calendar = await calRoute.handler.GET(
    ctx("http://localhost/cal/expired.ics", {}, { token: "expired" }),
  );
  assertEquals(calendar.status, 410);
  assertStringIncludes(await calendar.text(), "expired");

  const pageError = await viewRoute.handlers.GET(
    ctx("http://localhost/view/expired", {}, { token: "expired" }),
  ).then(
    () => null,
    (error) => error,
  );
  assertEquals((pageError as Error & { status: number }).status, 410);
  assertStringIncludes((pageError as Error).message, "Ask for a new one");

  const adminError = await adminPeopleRoute.handlers.GET(
    ctx("http://localhost/admin/people/", {
      headers: { cookie: "family_admin=expired" },
    }),
  ).then(
    () => null,
    (error) => error,
  );
  assertEquals((adminError as Error & { status: number }).status, 410);
});

routeTest("unknown pages use the shared 404 template", async () => {
  const response = await main.app.handler()(new Request("http://localhost/does-not-exist"));
  assertEquals(response.status, 404);
  const body = await response.text();
  assertStringIncludes(body, "Page not found");
  assertStringIncludes(body, "Family Calendar");
});

routeTest("GET /health returns ok", async () => {
  assertEquals(await (await healthRoute.handler.GET()).text(), "ok");
});
