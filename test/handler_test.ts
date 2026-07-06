import { closeStoreForTests, getStore } from "../lib/db.ts";
import { t } from "../lib/i18n.ts";
import { assert, assertEquals, assertRejects, assertStringIncludes } from "./asserts.ts";
import { populateTestStore, TEST_GROUPS } from "./fixtures.ts";

Deno.env.set("KV_PATH", ":memory:");

const aboutRoute = await import("../routes/about.tsx");
const calendarPageRoute = await import("../routes/calendar/index.tsx");
const healthRoute = await import("../routes/health.ts");
const indexRoute = await import("../routes/index.tsx");
const inviteRoute = await import("../routes/invite/[token].tsx");
const logoutRoute = await import("../routes/logout.ts");
const viewRoute = await import("../routes/view/[token].tsx");
const adminRoute = await import("../routes/admin/index.tsx");
const adminAuditRoute = await import("../routes/admin/audit/index.tsx");
const adminGroupsRoute = await import("../routes/admin/groups/index.tsx");
const adminInvitesRoute = await import("../routes/admin/invites/index.tsx");
const adminPeopleRoute = await import("../routes/admin/people/index.tsx");
const adminViewersRoute = await import("../routes/admin/viewers/index.tsx");
const dataRoute = await import("../routes/api/data/[token].ts");
const peopleRoute = await import("../routes/api/people/[token].ts");
const eventsRoute = await import("../routes/api/events/[token].ts");
const auditRoute = await import("../routes/api/audit/[token].ts");
const welcomeRoute = await import("../routes/api/welcome.ts");
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

function responseCookies(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
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

routeTest("GET /cal/<feedToken>.ics resolves via the stable feed token", async () => {
  const store = await getStore();
  await store.upsertViewer({
    token: "sess-x",
    feedToken: "feed-x",
    name: "Feed User",
    email: "feed@example.com",
    groups: [],
    isAdmin: false,
  });
  const res = await calRoute.handler.GET(
    ctx("http://localhost/cal/feed-x.ics", {}, { token: "feed-x" }),
  );
  assertEquals(res.status, 200);
  assertStringIncludes(res.headers.get("content-type") ?? "", "text/calendar");
  await res.text();
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
  assert(data.people.every((person: { affiliation: string }) => person.affiliation === "dk"));
  assert(data.groups && Object.keys(data.groups).length === 2);
  assert(Array.isArray(data.holidays) && data.holidays.length > 0);

  const bad = await dataRoute.handler.GET(
    ctx("http://localhost/api/data/nope", {}, { token: "nope" }),
  );
  assertEquals(bad.status, 404);
});

routeTest(
  "admin token persists and attributes changes, member token cannot bulk-replace",
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
        "http://localhost/api/people/admin",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            people: [
              {
                id: "solveig",
                name: "Solveig",
                born: "1992-05-13",
                affiliation: "no",
                notes: "",
              },
            ],
          }),
        },
        { token: "admin" },
      ),
    );
    assertEquals(res.status, 200);
    const { people } = await res.json();
    assertEquals(people.length, 1);

    const audit = await (
      await auditRoute.handler.GET(
        ctx("http://localhost/api/audit/admin", {}, { token: "admin" }),
      )
    ).json();
    assert(audit.audit.length > 0, "changes should be audited");
    assert(audit.audit.some((a: { action: string }) => a.action === "delete"));
    assert(audit.audit.every((a: { actor: string }) => a.actor === "Family admin"));
  },
);

routeTest("POST /api/people rejects invalid dates with 400", async () => {
  const res = await peopleRoute.handler.POST(
    ctx(
      "http://localhost/api/people/admin",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          people: [{ name: "Bad", born: "13-40-99", affiliation: "no" }],
        }),
      },
      { token: "admin" },
    ),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assert(typeof body.error === "string");
});

routeTest("PATCH /api/people updates one person for admin tokens", async () => {
  const res = await peopleRoute.handler.PATCH(
    ctx(
      "http://localhost/api/people/admin",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "solveig",
          person: {
            name: "Solveig Updated",
            born: "1992-05-13",
            died: null,
            affiliation: "no",
            notes: "Updated inline",
          },
        }),
      },
      { token: "admin" },
    ),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).person.name, "Solveig Updated");
});

routeTest("/about uses the current viewer session in shared navigation", async () => {
  assertEquals(typeof aboutRoute.default, "function");
  const result = await aboutRoute.handlers.GET(
    ctx("http://localhost/about", {
      headers: { cookie: "family_viewer=admin" },
    }),
  );
  assert(!(result instanceof Response));
  assertEquals(result.data.viewerName, "Family admin");
  assertEquals(result.data.adminUrl, "/admin/");
});

routeTest("PUT /api/events adds an event for admin tokens", async () => {
  const res = await eventsRoute.handler.PUT(
    ctx(
      "http://localhost/api/events/admin",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: { kind: "wedding", title: "Bryllup", date: "06-04", groups: ["no"] },
        }),
      },
      { token: "admin" },
    ),
  );
  assertEquals(res.status, 200);
  const { event } = await res.json();
  assertEquals(event.title, "Bryllup");
  assert((await (await getStore()).listEvents()).some((e) => e.id === event.id));
});

routeTest("PUT /api/events lets any member add an event", async () => {
  const res = await eventsRoute.handler.PUT(
    ctx(
      "http://localhost/api/events/view-all",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: { kind: "wedding", title: "Medlemsbryllup", date: "07-12", groups: ["no"] },
        }),
      },
      { token: "view-all" },
    ),
  );
  assertEquals(res.status, 200);
  const { event } = await res.json();
  assertEquals(event.title, "Medlemsbryllup");
  const audit = await (await getStore()).listAudit();
  assert(audit.some((entry) => entry.actor === "Everyone" && entry.action === "create_event"));
});

routeTest("PATCH /api/people lets any member edit a person", async () => {
  const res = await peopleRoute.handler.PATCH(
    ctx(
      "http://localhost/api/people/view-all",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "solveig",
          person: {
            name: "Solveig Member-Edited",
            born: "1992-05-13",
            died: null,
            affiliation: "no",
            notes: "",
          },
        }),
      },
      { token: "view-all" },
    ),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).person.name, "Solveig Member-Edited");
});

routeTest("private calendar and admin pages enforce viewer capabilities", async () => {
  const login = await viewRoute.handlers.GET(
    ctx("http://localhost/view/view-dk", {}, { token: "view-dk" }),
  );
  assert(login instanceof Response);
  assertEquals(login.status, 303);
  assertEquals(login.headers.get("location"), "/calendar/");
  const viewerCookies = responseCookies(login);
  assertStringIncludes(viewerCookies, "family_viewer=view-dk");

  const calendar = await calendarPageRoute.handlers.GET(
    ctx("http://localhost/calendar/", { headers: { cookie: viewerCookies } }),
  );
  assert(!(calendar instanceof Response));
  assert(calendar.data.calendar.people.every((person) => person.affiliation === "dk"));
  assertEquals(calendar.data.viewerName, "Danish family");
  assertEquals(calendar.data.editUrl, undefined);
  // Members don't get the admin link, but adding people/events is open to them.
  assertEquals(calendar.data.saveUrl, "/api/people/view-dk");
  assertEquals(calendar.data.eventsSaveUrl, "/api/events/view-dk");

  const entry = await adminRoute.handlers.GET(
    ctx("http://localhost/admin/?token=admin"),
  );
  assert(entry instanceof Response);
  assertEquals(entry.status, 303);
  const cookie = responseCookies(entry);
  assertStringIncludes(cookie, "family_admin=admin");
  assertStringIncludes(cookie, "family_viewer=admin");

  const result = await adminPeopleRoute.handlers.GET(
    ctx("http://localhost/admin/people/", { headers: { cookie } }),
  );
  assert(!(result instanceof Response));
  assert(Array.isArray(result.data.people) && result.data.people.length > 0);
  assert(Array.isArray(result.data.groups) && result.data.groups.length === 2);
  assertEquals(result.data.viewer.name, "Family admin");

  for (
    const [route, path] of [
      [adminGroupsRoute, "groups"],
      [adminViewersRoute, "viewers"],
      [adminInvitesRoute, "invites"],
      [adminAuditRoute, "audit"],
    ] as const
  ) {
    const page = await route.handlers.GET(
      ctx(`http://localhost/admin/${path}/`, { headers: { cookie } }),
    );
    assert(!(page instanceof Response));
    assertEquals(page.data.viewer.name, "Family admin");
  }

  const groupForm = new FormData();
  TEST_GROUPS.forEach((group, index) => {
    groupForm.append("key", group.key);
    groupForm.append("label", group.label);
    groupForm.append(`color-${index}`, group.color);
  });
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

routeTest("remembered viewer sessions redirect home and logout clears access", async () => {
  const cookie = "family_viewer=view-all";
  const home = await indexRoute.handlers.GET(
    ctx("http://localhost/", { headers: { cookie } }),
  );
  assert(home instanceof Response);
  assertEquals(home.status, 303);
  assertEquals(home.headers.get("location"), "/calendar/");

  const logout = logoutRoute.handler.POST();
  assertEquals(logout.status, 303);
  assertEquals(logout.headers.get("location"), "/");
  const cleared = logout.headers.getSetCookie();
  assert(
    cleared.some((value) => value.startsWith("family_viewer=") && value.includes("Max-Age=0")),
  );
  assert(cleared.some((value) => value.startsWith("family_admin=") && value.includes("Max-Age=0")));
});

routeTest("admin can issue a new viewer link", async () => {
  const form = new FormData();
  form.set("name", "New relative");
  form.set("email", "new.relative@example.com");
  form.append("groups", "dk");
  form.set("isAdmin", "on");
  const response = await adminViewersRoute.handlers.POST(
    ctx("http://localhost/admin/viewers/", {
      method: "POST",
      headers: { cookie: "family_admin=admin" },
      body: form,
    }),
  );
  assertEquals(response.status, 303);
  const location = response.headers.get("location") ?? "";
  assertStringIncludes(location, "/admin/viewers/?created=");
  const token = new URL(location, "http://localhost").searchParams.get("created");
  assert(token);

  const created = await (await getStore()).getViewer(token);
  assertEquals(created?.name, "New relative");
  assertEquals(created?.email, "new.relative@example.com");
  assertEquals(created?.groups, ["dk"]);
  assertEquals(created?.isAdmin, true);

  const result = await adminViewersRoute.handlers.GET(
    ctx(`http://localhost${location}`, {
      headers: { cookie: "family_admin=admin" },
    }),
  );
  assert(!(result instanceof Response));
  assertEquals(result.data.created?.viewer.token, token);
  assertStringIncludes(result.data.created?.urls.calendar ?? "", `/view/${token}`);
  assertStringIncludes(result.data.created?.urls.admin ?? "", `/admin/?token=${token}`);
});

routeTest("admin can filter viewers and expire an active token", async () => {
  const store = await getStore();
  const filtered = await adminViewersRoute.handlers.GET(
    ctx("http://localhost/admin/viewers/?status=active&permission=view&group=dk&q=danish", {
      headers: { cookie: "family_admin=admin" },
    }),
  );
  assert(!(filtered instanceof Response));
  assertEquals(filtered.data.viewers.map((viewer) => viewer.token), ["view-dk"]);

  const form = new FormData();
  form.set("action", "expire");
  form.set("token", "view-dk");
  const response = await adminViewersRoute.handlers.POST(
    ctx("http://localhost/admin/viewers/", {
      method: "POST",
      headers: { cookie: "family_admin=admin" },
      body: form,
    }),
  );
  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/admin/viewers/?expired=1");
  assert((await store.getViewer("view-dk"))?.expiredAt);
});

routeTest("family members can redeem an active invite and sign in as admins", async () => {
  const store = await getStore();
  await store.upsertInvite({
    token: "join-family",
    createdAt: "2026-06-08T10:00:00Z",
    expiresAt: "2099-06-15T10:00:00Z",
    isAdmin: true,
  });

  const invitePage = await inviteRoute.handlers.GET(
    ctx("http://localhost/invite/join-family", {}, { token: "join-family" }),
  );
  assert(!(invitePage instanceof Response));
  assertEquals(invitePage.data.groups, TEST_GROUPS);

  const form = new FormData();
  form.set("name", "New family member");
  form.set("email", "New.Member@Example.com");
  form.append("groups", "no");
  const signup = await inviteRoute.handlers.POST(
    ctx(
      "http://localhost/invite/join-family",
      { method: "POST", body: form },
      { token: "join-family" },
    ),
  );
  assertEquals(signup.status, 303);
  const location = signup.headers.get("location") ?? "";
  assertStringIncludes(location, "/view/");
  assertStringIncludes(location, "welcome=1");
  const viewerToken = new URL(location, "http://localhost").pathname.split("/").at(-1);
  assert(viewerToken);
  const viewer = await store.getViewer(viewerToken);
  assertEquals(viewer?.name, "New family member");
  assertEquals(viewer?.email, "new.member@example.com");
  assertEquals(viewer?.groups, ["no"]);
  assertEquals(viewer?.isAdmin, true);

  const login = await viewRoute.handlers.GET(
    ctx(`http://localhost${location}`, {}, { token: viewerToken }),
  );
  assertEquals(login.status, 303);
  assertEquals(login.headers.get("location"), "/calendar/?welcome=1");
  const cookies = responseCookies(login);
  assertStringIncludes(cookies, `family_viewer=${viewerToken}`);
  assertStringIncludes(cookies, `family_admin=${viewerToken}`);
});

routeTest("welcome tour shows once and can subscribe to the monthly email", async () => {
  const store = await getStore();
  await store.upsertViewer({
    token: "fresh-member",
    name: "Fresh Member",
    email: "fresh@example.com",
    groups: ["no"],
    isAdmin: false,
  });
  const cookie = "family_viewer=fresh-member";

  // Any first visit shows the tour — invited and admin-issued viewers alike.
  const withTour = await calendarPageRoute.handlers.GET(
    ctx("http://localhost/calendar/", { headers: { cookie } }),
  );
  assert(!(withTour instanceof Response));
  assert(withTour.data.welcome);
  assertStringIncludes(withTour.data.welcome.feedUrl, ".ics");
  assertEquals(withTour.data.welcome.hasEmail, true);

  // Subscribing from the tour records the newsletter opt-in.
  const subscribe = await welcomeRoute.handler.POST(
    ctx("http://localhost/api/welcome", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "subscribe" }),
    }),
  );
  assertEquals(subscribe.status, 200);
  await subscribe.text();
  assertEquals((await store.getViewer("fresh-member"))?.newsletter?.email, "fresh@example.com");

  // Finishing stamps welcomedAt, so the tour stops auto-showing …
  const done = await welcomeRoute.handler.POST(
    ctx("http://localhost/api/welcome", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "done" }),
    }),
  );
  assertEquals(done.status, 200);
  await done.text();
  assert((await store.getViewer("fresh-member"))?.welcomedAt);

  const again = await calendarPageRoute.handlers.GET(
    ctx("http://localhost/calendar/", { headers: { cookie } }),
  );
  assert(!(again instanceof Response));
  assertEquals(again.data.welcome, null);

  // … but ?welcome=1 (the "Show welcome tour" menu item) replays it on demand.
  const replay = await calendarPageRoute.handlers.GET(
    ctx("http://localhost/calendar/?welcome=1", { headers: { cookie } }),
  );
  assert(!(replay instanceof Response));
  assert(replay.data.welcome);

  // Dismissing the getting-started checklist sticks on the viewer record.
  assertEquals(again.data.checklistDismissed, false);
  const dismiss = await welcomeRoute.handler.POST(
    ctx("http://localhost/api/welcome", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "dismiss-checklist" }),
    }),
  );
  assertEquals(dismiss.status, 200);
  await dismiss.text();
  const afterDismiss = await calendarPageRoute.handlers.GET(
    ctx("http://localhost/calendar/", { headers: { cookie } }),
  );
  assert(!(afterDismiss instanceof Response));
  assertEquals(afterDismiss.data.checklistDismissed, true);
});

routeTest("invite signup requires a valid email", async () => {
  const store = await getStore();
  await store.upsertInvite({
    token: "join-family",
    createdAt: "2026-06-08T10:00:00Z",
    expiresAt: "2099-06-15T10:00:00Z",
    isAdmin: false,
  });
  const form = new FormData();
  form.set("name", "No Email");
  form.set("email", "not-an-email");
  await assertRejects(() =>
    inviteRoute.handlers.POST(
      ctx("http://localhost/invite/join-family", { method: "POST", body: form }, {
        token: "join-family",
      }),
    )
  );
});

routeTest("invite signup rejects an email already in use", async () => {
  const store = await getStore();
  await store.upsertViewer({
    token: "existing",
    name: "Existing",
    email: "taken@example.com",
    groups: ["no"],
    isAdmin: false,
  });
  await store.upsertInvite({
    token: "join-family",
    createdAt: "2026-06-08T10:00:00Z",
    expiresAt: "2099-06-15T10:00:00Z",
    isAdmin: false,
  });
  const form = new FormData();
  form.set("name", "Duplicate");
  form.set("email", "Taken@example.com");
  await assertRejects(() =>
    inviteRoute.handlers.POST(
      ctx("http://localhost/invite/join-family", { method: "POST", body: form }, {
        token: "join-family",
      }),
    )
  );
});

routeTest("admin can create a reusable expiring invite", async () => {
  const form = new FormData();
  form.set("duration", "30m");
  form.set("isAdmin", "on");
  const before = Date.now();
  const response = await adminInvitesRoute.handlers.POST(
    ctx("http://localhost/admin/invites/", {
      method: "POST",
      headers: { cookie: "family_admin=admin" },
      body: form,
    }),
  );
  assertEquals(response.status, 303);
  const location = response.headers.get("location") ?? "";
  assertStringIncludes(location, "/admin/invites/?created=");
  const token = new URL(location, "http://localhost").searchParams.get("created");
  assert(token);
  const invite = await (await getStore()).getInvite(token);
  assertEquals(invite?.isAdmin, true);
  assert(invite && new Date(invite.expiresAt) > new Date(invite.createdAt));
  assert(invite && new Date(invite.expiresAt).getTime() - before <= 30 * 60_000 + 1_000);

  const result = await adminInvitesRoute.handlers.GET(
    ctx(`http://localhost${location}`, {
      headers: { cookie: "family_admin=admin" },
    }),
  );
  assert(!(result instanceof Response));
  assertEquals(result.data.created?.invite.token, token);
  assertStringIncludes(result.data.created?.url ?? "", `/invite/${token}`);
});

routeTest("admin can create a view-only invite", async () => {
  const form = new FormData();
  form.set("duration", "4h");
  const response = await adminInvitesRoute.handlers.POST(
    ctx("http://localhost/admin/invites/", {
      method: "POST",
      headers: { cookie: "family_admin=admin" },
      body: form,
    }),
  );
  const token = new URL(
    response.headers.get("location") ?? "",
    "http://localhost",
  ).searchParams.get("created");
  assert(token);
  assertEquals((await (await getStore()).getInvite(token))?.isAdmin, false);
});

routeTest("expired family invites cannot be redeemed", async () => {
  const store = await getStore();
  await store.upsertInvite({
    token: "expired-invite",
    createdAt: "2020-01-01T00:00:00Z",
    expiresAt: "2020-01-02T00:00:00Z",
    isAdmin: true,
  });
  let error: unknown;
  try {
    await inviteRoute.handlers.GET(
      ctx("http://localhost/invite/expired-invite", {}, { token: "expired-invite" }),
    );
  } catch (cause) {
    error = cause;
  }
  assert(error instanceof Error);
  assertEquals((error as { status?: number }).status, 410);
});

routeTest("expired capabilities return a specific expired response", async () => {
  const store = await getStore();
  await store.upsertViewer({
    token: "expired",
    name: "Expired viewer",
    email: "expired@example.com",
    groups: [],
    isAdmin: true,
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
  assertEquals((pageError as Error).message, t("error.linkExpired"));

  // Expired cookies mean signed out (404 via adminDenied), never a 410 wall.
  const adminError = await adminPeopleRoute.handlers.GET(
    ctx("http://localhost/admin/people/", {
      headers: { cookie: "family_admin=expired" },
    }),
  ).then(
    () => null,
    (error) => error,
  );
  assertEquals((adminError as Error & { status: number }).status, 404);
});

routeTest("an expired session cookie is signed out, not locked out", async () => {
  const store = await getStore();
  await store.upsertViewer({
    token: "stale",
    name: "Stale viewer",
    email: "stale@example.com",
    groups: [],
    isAdmin: false,
    expiredAt: "2026-06-06T12:00:00Z",
  });

  // The landing page renders instead of throwing 410, so the holder of a stale
  // cookie can always reach the login form again.
  const landing = await indexRoute.handlers.GET(
    ctx("http://localhost/", { headers: { cookie: "family_viewer=stale" } }),
  );
  assert(!(landing instanceof Response));

  // Protected pages report a missing link (404), not an expired-link wall.
  const calendar = await calendarPageRoute.handlers.GET(
    ctx("http://localhost/calendar/", { headers: { cookie: "family_viewer=stale" } }),
  ).then(
    () => null,
    (error) => error,
  );
  assertEquals((calendar as Error & { status: number }).status, 404);
});

routeTest("unknown pages use the shared 404 template", async () => {
  const response = await main.app.handler()(
    new Request("http://localhost/does-not-exist", { headers: { cookie: "family_lang=en" } }),
  );
  assertEquals(response.status, 404);
  const body = await response.text();
  assertStringIncludes(body, "Page not found");
  assertStringIncludes(body, "Family Calendar");
});

routeTest("GET /health pings KV and reports the running commit", async () => {
  const response = await healthRoute.handler.GET();
  assertEquals(response.status, 200);
  // "dev" outside a deployed bundle; deploys bake the commit in via vite define.
  assertEquals(await response.text(), "ok dev");
});
