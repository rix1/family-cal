import { closeStoreForTests, getStore } from "../lib/db.ts";
import { pad2 } from "../lib/dates.ts";
import { addMonths, monthKey, osloToday } from "../lib/newsletter.ts";
import { assert, assertEquals, assertRejects, assertStringIncludes } from "./asserts.ts";
import { populateTestStore } from "./fixtures.ts";

Deno.env.set("KV_PATH", ":memory:");

const newsletterRoute = await import("../routes/newsletter/index.tsx");
const adminNewslettersRoute = await import("../routes/admin/newsletters/index.tsx");
const draftRoute = await import("../routes/admin/newsletters/[id]/index.tsx");

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

routeTest("the newsletter page requires a viewer session", async () => {
  await assertRejects(() => newsletterRoute.handlers.GET(ctx("http://localhost/newsletter/")));
  await assertRejects(() =>
    newsletterRoute.handlers.POST(
      ctx("http://localhost/newsletter/", { method: "POST", body: form({ email: "a@b.c" }) }),
    )
  );
});

routeTest("viewers subscribe, update and unsubscribe; duplicates are rejected", async () => {
  const store = await getStore();
  const subscribed = await newsletterRoute.handlers.POST(
    ctx("http://localhost/newsletter/", {
      method: "POST",
      headers: VIEWER,
      body: form({ email: "  Rix@Example.com ", groups: ["dk"] }),
    }),
  );
  assert(subscribed instanceof Response);
  assertEquals(subscribed.status, 303);
  assertEquals(subscribed.headers.get("location"), "/newsletter/?saved=1");
  let viewer = await store.getViewer("view-all");
  assertEquals(viewer?.newsletter?.email, "rix@example.com");
  assertEquals(viewer?.newsletter?.groups, ["dk"]);

  const page = await newsletterRoute.handlers.GET(
    ctx("http://localhost/newsletter/?saved=1", { headers: VIEWER }),
  );
  assert(!(page instanceof Response));
  assertEquals(page.data.newsletter?.email, "rix@example.com");
  assertEquals(page.data.saved, true);

  // Another active viewer cannot reuse the address; invalid emails are rejected.
  await assertRejects(() =>
    newsletterRoute.handlers.POST(
      ctx("http://localhost/newsletter/", {
        method: "POST",
        headers: { cookie: "family_viewer=view-dk" },
        body: form({ email: "RIX@example.com" }),
      }),
    )
  );
  await assertRejects(() =>
    newsletterRoute.handlers.POST(
      ctx("http://localhost/newsletter/", {
        method: "POST",
        headers: VIEWER,
        body: form({ email: "not an email" }),
      }),
    )
  );

  const unsubscribed = await newsletterRoute.handlers.POST(
    ctx("http://localhost/newsletter/", {
      method: "POST",
      headers: VIEWER,
      body: form({ action: "unsubscribe" }),
    }),
  );
  assert(unsubscribed instanceof Response);
  assertEquals(unsubscribed.headers.get("location"), "/newsletter/?unsubscribed=1");
  viewer = await store.getViewer("view-all");
  assertEquals(viewer?.newsletter, undefined);

  const actions = (await store.listAudit()).map((entry) => entry.action);
  assert(actions.includes("newsletter_subscribe"));
  assert(actions.includes("newsletter_unsubscribe"));
});

routeTest("admin newsletters require an editor capability", async () => {
  await assertRejects(() =>
    adminNewslettersRoute.handlers.GET(ctx("http://localhost/admin/newsletters/"))
  );
  // A view-only session is not enough.
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
  assertEquals(page.data.settings.leadDays, 7);
  assertEquals(page.data.drafts, []);
});

routeTest("lead-time settings are validated and saved", async () => {
  const saved = await adminNewslettersRoute.handlers.POST(
    ctx("http://localhost/admin/newsletters/", {
      method: "POST",
      headers: ADMIN,
      body: form({ action: "settings", leadDays: "14" }),
    }),
  );
  assert(saved instanceof Response);
  assertEquals(saved.status, 303);
  assertEquals((await (await getStore()).getNewsletterSettings()).leadDays, 14);

  await assertRejects(() =>
    adminNewslettersRoute.handlers.POST(
      ctx("http://localhost/admin/newsletters/", {
        method: "POST",
        headers: ADMIN,
        body: form({ action: "settings", leadDays: "0" }),
      }),
    )
  );
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
  // Guarantee a birthday in the target month for the all-groups segment.
  await store.upsertPerson({
    id: "nl-target",
    name: "Nyhetsbrevperson",
    born: `${target.year - 30}-${pad2(target.month)}-15`,
    died: null,
    groups: ["no"],
    notes: "",
  });
  await newsletterRoute.handlers.POST(
    ctx("http://localhost/newsletter/", {
      method: "POST",
      headers: VIEWER,
      body: form({ email: "rix@example.com" }),
    }),
  );

  // Out-of-range months are rejected; the valid one creates the segment draft.
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

  const list = await adminNewslettersRoute.handlers.GET(
    ctx("http://localhost/admin/newsletters/", { headers: ADMIN }),
  );
  assert(!(list instanceof Response));
  assertEquals(list.data.drafts.length, 1);
  assertEquals(list.data.drafts[0].segment, "all");
  assertEquals(list.data.subscribers.map((s) => s.email), ["rix@example.com"]);

  const id = list.data.drafts[0].id;
  const url = `http://localhost/admin/newsletters/${id}/`;
  await assertRejects(() =>
    draftRoute.handlers.GET(
      ctx("http://localhost/admin/newsletters/nope/", { headers: ADMIN }, { id: "nope" }),
    )
  );
  const detail = await draftRoute.handlers.GET(ctx(url, { headers: ADMIN }, { id }));
  assert(!(detail instanceof Response));
  assertEquals(detail.data.draft.month, month);
  assertStringIncludes(detail.data.bcc, "rix@example.com");
  assertStringIncludes(detail.data.html, "Nyhetsbrevperson");
  assertStringIncludes(detail.data.html, "<h2");
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

  const sent = await draftRoute.handlers.POST(
    ctx(url, { method: "POST", headers: ADMIN, body: form({ action: "send" }) }, { id }),
  );
  assert(sent instanceof Response);
  const sentDraft = await store.getNewsletterDraft(id);
  assertEquals(sentDraft?.status, "sent");
  assertEquals(sentDraft?.recipientCount, 1);
  assertEquals(sentDraft?.sentBy, "Family editor");

  // Sent drafts are immutable but can still be deleted.
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

routeTest("the ensure action is admin-only, idempotent JSON; GET stays read-only", async () => {
  const store = await getStore();
  await assertRejects(() =>
    adminNewslettersRoute.handlers.POST(
      ctx("http://localhost/admin/newsletters/", {
        method: "POST",
        body: form({ action: "ensure" }),
      }),
    )
  );

  // Reading the page never creates drafts, with or without subscribers.
  await adminNewslettersRoute.handlers.GET(
    ctx("http://localhost/admin/newsletters/", { headers: ADMIN }),
  );
  assertEquals(await store.listNewsletterDrafts(), []);

  // No subscribers: nothing to ensure regardless of the lead window.
  const res = await adminNewslettersRoute.handlers.POST(
    ctx("http://localhost/admin/newsletters/", {
      method: "POST",
      headers: ADMIN,
      body: form({ action: "ensure" }),
    }),
  );
  assert(res instanceof Response);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(typeof body.created, "number");
  assertEquals(body.created, 0);
});
