import { closeStoreForTests, getStore } from "../lib/db.ts";
import { pad2 } from "../lib/dates.ts";
import { addMonths, monthKey, osloToday } from "../lib/newsletter.ts";
import { assert, assertEquals, assertRejects, assertStringIncludes } from "./asserts.ts";
import { populateTestStore } from "./fixtures.ts";

Deno.env.set("KV_PATH", ":memory:");

const profileRoute = await import("../routes/profile/index.tsx");
const adminNewslettersRoute = await import("../routes/admin/newsletters/index.tsx");
const draftRoute = await import("../routes/admin/newsletters/[id].tsx");

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

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

const VIEWER = { cookie: "family_viewer=view-all" };
const ADMIN = { cookie: "family_admin=editor; family_viewer=editor" };
// view-all follows both seeded groups ("no", "dk") → this segment key.
const ALL_SEGMENT = "dk+no";

routeTest("the profile page requires a viewer session", async () => {
  await assertRejects(() => profileRoute.handlers.GET(ctx("http://localhost/profile/")));
  await assertRejects(() =>
    profileRoute.handlers.POST(
      ctx("http://localhost/profile/", { method: "POST", body: form({ action: "subscribe" }) }),
    )
  );
});

routeTest("a viewer edits the groups they follow", async () => {
  const store = await getStore();
  const res = await profileRoute.handlers.POST(
    ctx("http://localhost/profile/", {
      method: "POST",
      headers: VIEWER,
      body: form({ action: "groups", groups: ["dk"] }),
    }),
  );
  assert(res instanceof Response);
  assertEquals(res.headers.get("location"), "/profile/?saved=groups");
  assertEquals((await store.getViewer("view-all"))?.groups, ["dk"]);

  // Unknown groups are rejected.
  await assertRejects(() =>
    profileRoute.handlers.POST(
      ctx("http://localhost/profile/", {
        method: "POST",
        headers: VIEWER,
        body: form({ action: "groups", groups: ["bogus"] }),
      }),
    )
  );
});

routeTest("a viewer subscribes to and unsubscribes from the monthly email", async () => {
  const store = await getStore();
  const subscribed = await profileRoute.handlers.POST(
    ctx("http://localhost/profile/", {
      method: "POST",
      headers: VIEWER,
      body: form({ action: "subscribe" }),
    }),
  );
  assert(subscribed instanceof Response);
  assertEquals(subscribed.status, 303);
  assertEquals(subscribed.headers.get("location"), "/profile/?saved=subscribed");
  let viewer = await store.getViewer("view-all");
  assertEquals(viewer?.newsletter?.email, "everyone@example.com");

  const page = await profileRoute.handlers.GET(
    ctx("http://localhost/profile/?saved=subscribed", { headers: VIEWER }),
  );
  assert(!(page instanceof Response));
  assertEquals(page.data.subscribed, true);

  const unsubscribed = await profileRoute.handlers.POST(
    ctx("http://localhost/profile/", {
      method: "POST",
      headers: VIEWER,
      body: form({ action: "unsubscribe" }),
    }),
  );
  assert(unsubscribed instanceof Response);
  assertEquals(unsubscribed.headers.get("location"), "/profile/?saved=unsubscribed");
  viewer = await store.getViewer("view-all");
  assertEquals(viewer?.newsletter, undefined);

  const actions = (await store.listAudit()).map((entry) => entry.action);
  assert(actions.includes("newsletter_subscribe"));
  assert(actions.includes("newsletter_unsubscribe"));
});

async function subscribeViewer() {
  await profileRoute.handlers.POST(
    ctx("http://localhost/profile/", {
      method: "POST",
      headers: VIEWER,
      body: form({ action: "subscribe" }),
    }),
  );
}

routeTest("admin newsletters require an editor capability", async () => {
  await assertRejects(() =>
    adminNewslettersRoute.handlers.GET(ctx("http://localhost/admin/newsletters/"))
  );
  await assertRejects(() =>
    adminNewslettersRoute.handlers.GET(
      ctx("http://localhost/admin/newsletters/", {
        headers: { cookie: "family_admin=view-all" },
      }),
    )
  );
  const page = await adminNewslettersRoute.handlers.GET(
    ctx("http://localhost/admin/newsletters/", { headers: ADMIN }),
  );
  assert(!(page instanceof Response));
  assertEquals(page.data.drafts, []);
});

routeTest("unknown newsletter actions are rejected", async () => {
  await assertRejects(() =>
    adminNewslettersRoute.handlers.POST(
      ctx("http://localhost/admin/newsletters/", {
        method: "POST",
        headers: ADMIN,
        body: form({ action: "bogus" }),
      }),
    )
  );
});

routeTest("generation, editing, sending and deleting a draft work end-to-end", async () => {
  const store = await getStore();
  const today = osloToday();
  const target = addMonths({ year: today.year, month: today.month }, 1);
  const month = monthKey(target);
  await store.upsertPerson({
    id: "nl-target",
    name: "Nyhetsbrevperson",
    born: `${target.year - 30}-${pad2(target.month)}-15`,
    died: null,
    affiliation: "no",
    notes: "",
  });
  await subscribeViewer();

  await assertRejects(() =>
    adminNewslettersRoute.handlers.POST(
      ctx("http://localhost/admin/newsletters/", {
        method: "POST",
        headers: ADMIN,
        body: form({ action: "generate", month: "2099-01" }),
      }),
    )
  );
  const generated = await adminNewslettersRoute.handlers.POST(
    ctx("http://localhost/admin/newsletters/", {
      method: "POST",
      headers: ADMIN,
      body: form({ action: "generate", month }),
    }),
  );
  assert(generated instanceof Response);
  assertEquals(generated.headers.get("location"), "/admin/newsletters/?generated=1");

  await adminNewslettersRoute.handlers.POST(
    ctx("http://localhost/admin/newsletters/", {
      method: "POST",
      headers: ADMIN,
      body: form({ action: "generate", month }),
    }),
  );
  const list = await adminNewslettersRoute.handlers.GET(
    ctx("http://localhost/admin/newsletters/", { headers: ADMIN }),
  );
  assert(!(list instanceof Response));
  assertEquals(list.data.drafts.length, 2);
  assertEquals(list.data.drafts[0].segment, ALL_SEGMENT);
  assertEquals(list.data.subscribers.map((s) => s.email), ["everyone@example.com"]);

  const id = list.data.drafts[0].id;
  const url = `http://localhost/admin/newsletters/${id}`;
  await assertRejects(() =>
    draftRoute.handlers.GET(
      ctx("http://localhost/admin/newsletters/nope", { headers: ADMIN }, { id: "nope" }),
    )
  );
  const detail = await draftRoute.handlers.GET(ctx(url, { headers: ADMIN }, { id }));
  assert(!(detail instanceof Response));
  assertEquals(detail.data.draft.month, month);
  assertStringIncludes(detail.data.emailHtml, "<!DOCTYPE html>");
  assertStringIncludes(detail.data.emailHtml, "Nyhetsbrevperson");
  assertStringIncludes(detail.data.emailHtml, "<h2");
  assertStringIncludes(detail.data.draft.subject, "Familiekalenderen: bursdager i");

  const savedDraft = await draftRoute.handlers.POST(
    ctx(url, {
      method: "POST",
      headers: ADMIN,
      body: form({ action: "save", subject: "Egen tittel", body: "Hei!\n\nLista kommer her." }),
    }, { id }),
  );
  assert(savedDraft instanceof Response);
  assertEquals((await store.getNewsletterDraft(id))?.subject, "Egen tittel");

  // The preview action renders unsaved form values without persisting them.
  const previewed = await draftRoute.handlers.POST(
    ctx(url, {
      method: "POST",
      headers: ADMIN,
      body: form({ action: "preview", subject: "x", title: "Utkast-tittel", body: "Bare en test" }),
    }, { id }),
  );
  assert(previewed instanceof Response);
  const previewHtml = await previewed.text();
  assertStringIncludes(previewHtml, "Utkast-tittel");
  assertStringIncludes(previewHtml, "Bare en test");
  assert(!(await store.getNewsletterDraft(id))?.body.includes("Bare en test"));

  const sent = await draftRoute.handlers.POST(
    ctx(url, { method: "POST", headers: ADMIN, body: form({ action: "send" }) }, { id }),
  );
  assert(sent instanceof Response);
  const sentDraft = await store.getNewsletterDraft(id);
  assertEquals(sentDraft?.status, "sent");
  assertEquals(sentDraft?.recipientCount, 1);
  assertEquals(sentDraft?.sentBy, "Family editor");

  await assertRejects(() =>
    draftRoute.handlers.POST(
      ctx(url, {
        method: "POST",
        headers: ADMIN,
        body: form({ action: "save", subject: "x", body: "y" }),
      }, { id }),
    )
  );
  const deleted = await draftRoute.handlers.POST(
    ctx(url, { method: "POST", headers: ADMIN, body: form({ action: "delete" }) }, { id }),
  );
  assert(deleted instanceof Response);
  assertEquals(deleted.headers.get("location"), "/admin/newsletters/?deleted=1");
  assertEquals(await store.getNewsletterDraft(id), null);
});

routeTest(
  "the admin page flags subscriber segments missing a draft for the current month",
  async () => {
    const store = await getStore();
    const before = await adminNewslettersRoute.handlers.GET(
      ctx("http://localhost/admin/newsletters/", { headers: ADMIN }),
    );
    assert(!(before instanceof Response));
    assertEquals(await store.listNewsletterDrafts(), []);
    assertEquals(before.data.missing, []);

    const today = osloToday();
    await store.upsertPerson({
      id: "nl-current",
      name: "Bursdagsbarn",
      born: `1990-${pad2(today.month)}-${pad2(today.day)}`,
      died: null,
      affiliation: "no",
      notes: "",
    });
    await subscribeViewer();

    const withSubscriber = await adminNewslettersRoute.handlers.GET(
      ctx("http://localhost/admin/newsletters/", { headers: ADMIN }),
    );
    assert(!(withSubscriber instanceof Response));
    assertEquals(withSubscriber.data.missing, [ALL_SEGMENT]);

    await adminNewslettersRoute.handlers.POST(
      ctx("http://localhost/admin/newsletters/", {
        method: "POST",
        headers: ADMIN,
        body: form({ action: "generate", month: withSubscriber.data.currentMonth }),
      }),
    );
    const afterGenerate = await adminNewslettersRoute.handlers.GET(
      ctx("http://localhost/admin/newsletters/", { headers: ADMIN }),
    );
    assert(!(afterGenerate instanceof Response));
    assertEquals(afterGenerate.data.missing, []);
  },
);

routeTest("a draft can be deleted directly from the list page", async () => {
  const store = await getStore();
  const today = osloToday();
  await store.upsertPerson({
    id: "nl-list-delete",
    name: "Listebarn",
    born: `1990-${pad2(today.month)}-${pad2(today.day)}`,
    died: null,
    affiliation: "no",
    notes: "",
  });
  await subscribeViewer();
  const month = monthKey({ year: today.year, month: today.month });
  await adminNewslettersRoute.handlers.POST(
    ctx("http://localhost/admin/newsletters/", {
      method: "POST",
      headers: ADMIN,
      body: form({ action: "generate", month }),
    }),
  );
  const [draft] = await store.listNewsletterDrafts();

  await assertRejects(() =>
    adminNewslettersRoute.handlers.POST(
      ctx("http://localhost/admin/newsletters/", {
        method: "POST",
        body: form({ action: "delete", id: draft.id }),
      }),
    )
  );
  const deleted = await adminNewslettersRoute.handlers.POST(
    ctx("http://localhost/admin/newsletters/", {
      method: "POST",
      headers: ADMIN,
      body: form({ action: "delete", id: draft.id }),
    }),
  );
  assert(deleted instanceof Response);
  assertEquals(deleted.headers.get("location"), "/admin/newsletters/?deleted=1");
  assertEquals(await store.getNewsletterDraft(draft.id), null);

  await assertRejects(() =>
    adminNewslettersRoute.handlers.POST(
      ctx("http://localhost/admin/newsletters/", {
        method: "POST",
        headers: ADMIN,
        body: form({ action: "delete", id: draft.id }),
      }),
    )
  );
});

routeTest("an admin can remove a subscriber from the newsletter", async () => {
  const store = await getStore();
  await subscribeViewer();
  const before = await adminNewslettersRoute.handlers.GET(
    ctx("http://localhost/admin/newsletters/", { headers: ADMIN }),
  );
  assert(!(before instanceof Response));
  assertEquals(before.data.subscribers.map((s) => s.email), ["everyone@example.com"]);
  const token = before.data.subscribers[0].token;

  await assertRejects(() =>
    adminNewslettersRoute.handlers.POST(
      ctx("http://localhost/admin/newsletters/", {
        method: "POST",
        body: form({ action: "unsubscribe", token }),
      }),
    )
  );
  const removed = await adminNewslettersRoute.handlers.POST(
    ctx("http://localhost/admin/newsletters/", {
      method: "POST",
      headers: ADMIN,
      body: form({ action: "unsubscribe", token }),
    }),
  );
  assert(removed instanceof Response);
  assertEquals(removed.headers.get("location"), "/admin/newsletters/?unsubscribed=1");
  assertEquals((await store.getViewer(token))?.newsletter, undefined);

  await assertRejects(() =>
    adminNewslettersRoute.handlers.POST(
      ctx("http://localhost/admin/newsletters/", {
        method: "POST",
        headers: ADMIN,
        body: form({ action: "unsubscribe", token: "no-such-token" }),
      }),
    )
  );
});
