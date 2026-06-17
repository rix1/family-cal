import { createViewer, expirePreviousViewerLinks } from "../lib/access_links.ts";
import type { GroupInfo, Person, Viewer } from "../lib/model.ts";
import {
  addMonths,
  birthdaysForMonth,
  buildBody,
  buildPrompt,
  canonicalGroups,
  clearNewsletterPreference,
  defaultSubject,
  deleteDraft,
  draftRecipients,
  ensureDraftsForMonth,
  inLeadWindow,
  INTRO_PLACEHOLDER,
  markDraftSent,
  monthKey,
  normalizeLeadDays,
  osloToday,
  parseMonthKey,
  regenerateDraft,
  segmentKey,
  setNewsletterPreference,
  subscriberSegments,
  updateDraftContent,
} from "../lib/newsletter.ts";
import { SeedStore } from "../lib/store.ts";
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "./asserts.ts";

const GROUPS: GroupInfo[] = [
  { key: "berg-siden", label: "Norwegian side", flag: "🇳🇴" },
  { key: "dahl-siden", label: "Danish side", flag: "🇩🇰" },
];

const PEOPLE: Person[] = [
  {
    id: "kari",
    name: "Kari",
    born: "1984-06-03",
    died: null,
    groups: ["berg-siden"],
    notes: "supersecret note",
  },
  { id: "ola", name: "Ola", born: "06-07", died: null, groups: ["dahl-siden"], notes: "" },
  {
    id: "bestemor",
    name: "Bestemor Anna",
    born: "1931-06-12",
    died: "2020-01-15",
    groups: ["berg-siden"],
    notes: "",
  },
  {
    id: "tante",
    name: "Tante Liv",
    born: "06-03",
    died: "2015-02-02",
    groups: ["berg-siden"],
    notes: "",
  },
  {
    id: "begge",
    name: "Astrid",
    born: "1992-06-20",
    died: null,
    groups: ["berg-siden", "dahl-siden"],
    notes: "",
  },
  { id: "juli", name: "Per", born: "1990-07-01", died: null, groups: ["berg-siden"], notes: "" },
  { id: "ukjent", name: "Ukjent", born: null, died: null, groups: ["berg-siden"], notes: "" },
];

const JUNE = { year: 2026, month: 6 };

function subscriber(token: string, name: string, email: string, groups: string[]): Viewer {
  return {
    token,
    name,
    groups: [],
    canEdit: false,
    newsletter: {
      email,
      groups,
      subscribedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

Deno.test("oslo lead window includes exactly the final N calendar days", () => {
  // Summer (CEST, UTC+2): June has 30 days, leadDays 7 → window opens June 24.
  assertEquals(osloToday(new Date("2026-06-23T21:59:59Z")), { year: 2026, month: 6, day: 23 });
  assertEquals(osloToday(new Date("2026-06-23T22:00:00Z")), { year: 2026, month: 6, day: 24 });
  assert(!inLeadWindow(new Date("2026-06-23T21:59:59Z"), 7));
  assert(inLeadWindow(new Date("2026-06-23T22:00:00Z"), 7));
  assert(inLeadWindow(new Date("2026-06-30T10:00:00Z"), 7));
  // Winter (CET, UTC+1): December has 31 days, leadDays 7 → window opens Dec 25.
  assert(!inLeadWindow(new Date("2026-12-24T22:59:59Z"), 7));
  assert(inLeadWindow(new Date("2026-12-24T23:00:00Z"), 7));
  // February 2028 is a leap month: 29 days, leadDays 1 → only Feb 29.
  assert(!inLeadWindow(new Date("2028-02-28T12:00:00Z"), 1));
  assert(inLeadWindow(new Date("2028-02-29T12:00:00Z"), 1));
});

Deno.test("month keys parse, format and add across year boundaries", () => {
  assertEquals(monthKey({ year: 2026, month: 6 }), "2026-06");
  assertEquals(parseMonthKey("2026-06"), { year: 2026, month: 6 });
  assertEquals(parseMonthKey("2026-13"), null);
  assertEquals(parseMonthKey("2026-6"), null);
  assertEquals(parseMonthKey("junk"), null);
  assertEquals(addMonths({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assertEquals(addMonths({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
  assertEquals(addMonths({ year: 2026, month: 6 }, 12), { year: 2027, month: 6 });
});

Deno.test("lead days accept 1–28 and reject everything else", () => {
  assertEquals(normalizeLeadDays("1"), 1);
  assertEquals(normalizeLeadDays(28), 28);
  assertThrows(() => normalizeLeadDays(0));
  assertThrows(() => normalizeLeadDays(29));
  assertThrows(() => normalizeLeadDays(7.5));
  assertThrows(() => normalizeLeadDays("soon"));
});

Deno.test("segment keys are canonical: sorted, deduplicated, empty = all", () => {
  assertEquals(canonicalGroups([" dahl-siden", "berg-siden", "dahl-siden", ""]), [
    "berg-siden",
    "dahl-siden",
  ]);
  assertEquals(segmentKey([]), "all");
  assertEquals(segmentKey(["dahl-siden", "berg-siden"]), "berg-siden+dahl-siden");
  assertEquals(segmentKey(["dahl-siden", "berg-siden", "dahl-siden"]), "berg-siden+dahl-siden");
});

Deno.test("birthdays for a month: filtering, order, ages, unknown years, deceased", () => {
  const all = birthdaysForMonth(PEOPLE, JUNE, []);
  assertEquals(all.map((b) => b.personId), ["kari", "tante", "ola", "bestemor", "begge"]);
  const kari = all[0];
  assertEquals(kari.age, 42);
  assertEquals(kari.deceased, false);
  assertEquals(all.find((b) => b.personId === "ola")?.age, null);
  assertEquals(all.find((b) => b.personId === "bestemor")?.age, 95);
  assertEquals(all.find((b) => b.personId === "bestemor")?.deceased, true);

  // Any selected group matches; people in several groups appear once.
  const dansk = birthdaysForMonth(PEOPLE, JUNE, ["dahl-siden"]);
  assertEquals(dansk.map((b) => b.personId), ["ola", "begge"]);
});

Deno.test("the Norwegian body lists birthdays with the right wording", () => {
  const body = buildBody(JUNE, birthdaysForMonth(PEOPLE, JUNE, []));
  assert(body.startsWith(INTRO_PLACEHOLDER), "intro placeholder must lead the body");
  assertStringIncludes(body, "## Bursdager i juni 2026");
  assertStringIncludes(body, "- **3. juni** – Kari fyller 42 år");
  assertStringIncludes(body, "- **7. juni** – Ola har bursdag");
  assertStringIncludes(body, "- **12. juni** – Bestemor Anna ville ha fylt 95 år");
  assertStringIncludes(body, "- **3. juni** – til minne om Tante Liv");
  assert(!body.includes("supersecret"), "person notes must stay out of the newsletter");
  assert(!body.includes("Per"), "other months stay out");
});

Deno.test("the default subject is Norwegian month + year", () => {
  assertEquals(defaultSubject(JUNE), "Familiekalenderen: bursdager i juni 2026");
  assertEquals(
    defaultSubject({ year: 2027, month: 1 }),
    "Familiekalenderen: bursdager i januar 2027",
  );
});

Deno.test("the LLM prompt is anonymous: dates and counts only", () => {
  const birthdays = birthdaysForMonth(PEOPLE, JUNE, []);
  const prompt = buildPrompt(JUNE, birthdays);
  assertStringIncludes(prompt, "juni 2026");
  assertStringIncludes(prompt, `Antall bursdager: ${birthdays.length}`);
  assertStringIncludes(prompt, "3. juni (2 bursdager)");
  assertStringIncludes(prompt, "7. juni");
  assertStringIncludes(prompt, "2–3 setninger");
  for (
    const pii of [
      "Kari",
      "Ola",
      "Bestemor",
      "Anna",
      "Astrid",
      "Tante",
      "1984",
      "1931",
      "42",
      "95",
      "supersecret",
      "berg-siden",
      "dahl-siden",
      "Norwegian side",
      "Danish side",
      "@",
    ]
  ) {
    assert(!prompt.includes(pii), `prompt must not leak "${pii}"`);
  }
});

Deno.test("segments derive from active subscribers only", () => {
  const expired: Viewer = {
    ...subscriber("x1", "Gone", "gone@example.com", []),
    expiredAt: "2026-01-02T00:00:00.000Z",
  };
  const plain: Viewer = { token: "p1", name: "No mail", groups: [], canEdit: false };
  const viewers = [
    subscriber("a1", "Anna", "anna@example.com", []),
    subscriber("b1", "Bo", "bo@example.com", ["dahl-siden"]),
    subscriber("c1", "Cleo", "cleo@example.com", ["berg-siden", "dahl-siden"]),
    subscriber("d1", "Dag", "dag@example.com", ["dahl-siden", "berg-siden"]),
    expired,
    plain,
  ];
  const segments = subscriberSegments(viewers);
  assertEquals(segments.map((s) => s.key), ["all", "berg-siden+dahl-siden", "dahl-siden"]);
  assertEquals(segments[1].subscribers.length, 2);
});

Deno.test("draft generation is idempotent and skips segments without birthdays", async () => {
  const store = new SeedStore(PEOPLE, GROUPS, [
    subscriber("a1", "Anna", "anna@example.com", []),
    subscriber("b1", "Bo", "bo@example.com", ["dahl-siden"]),
    subscriber("e1", "Eli", "eli@example.com", ["berg-siden"]),
  ]);
  // July: only Per (berg-siden) has a birthday, so the dahl-siden segment is skipped.
  const july = { year: 2026, month: 7 };
  const created = await ensureDraftsForMonth(store, july, "Admin");
  assertEquals(created.map((d) => `${d.month} ${d.segment}`).sort(), [
    "2026-07 all",
    "2026-07 berg-siden",
  ]);
  assertEquals(created[0].status, "draft");
  assertStringIncludes(created[0].subject, "juli 2026");
  // Ids are opaque and URL-safe; month+segment is the natural key.
  assert(created.every((d) => /^[0-9a-f-]{36}$/.test(d.id)));

  const again = await ensureDraftsForMonth(store, july, "Admin");
  assertEquals(again, []);
  assertEquals((await store.listNewsletterDrafts()).length, 2);
});

Deno.test("drafts can be deleted; a still-valid month/segment regenerates", async () => {
  const store = new SeedStore(PEOPLE, GROUPS, [
    subscriber("a1", "Anna", "anna@example.com", []),
  ]);
  const [draft] = await ensureDraftsForMonth(store, JUNE, "Admin");
  await deleteDraft(store, draft.id, "Admin");
  assertEquals(await store.listNewsletterDrafts(), []);
  await assertRejects(() => deleteDraft(store, draft.id, "Admin"));

  const recreated = await ensureDraftsForMonth(store, JUNE, "Admin");
  assertEquals(recreated.length, 1);
  assert(recreated[0].id !== draft.id);

  // Sent records can be removed too.
  await markDraftSent(store, recreated[0].id, "Admin");
  await deleteDraft(store, recreated[0].id, "Admin");
  assertEquals(await store.listNewsletterDrafts(), []);
  const actions = (await store.listAudit()).map((entry) => entry.action);
  assertEquals(actions.filter((action) => action === "newsletter_delete").length, 2);
});

Deno.test("manual edits persist; regeneration discards them after confirmation", async () => {
  const store = new SeedStore(PEOPLE, GROUPS, [
    subscriber("a1", "Anna", "anna@example.com", []),
  ]);
  const [draft] = await ensureDraftsForMonth(store, JUNE, "Admin");

  const edited = await updateDraftContent(store, draft.id, {
    subject: "Sommerhilsen",
    body: "Hei alle sammen!\n\n" + draft.body,
  }, "Admin");
  assertEquals(edited.subject, "Sommerhilsen");
  assertStringIncludes(edited.body, "Hei alle sammen!");
  await assertRejects(() =>
    updateDraftContent(store, draft.id, { subject: " ", body: "x" }, "Admin")
  );

  const regenerated = await regenerateDraft(store, draft.id, "Admin");
  assertEquals(regenerated.subject, defaultSubject(JUNE));
  assert(!regenerated.body.includes("Hei alle sammen!"));
  assertStringIncludes(regenerated.body, INTRO_PLACEHOLDER);
});

Deno.test("recipients stay dynamic until sent; sent drafts are immutable", async () => {
  const store = new SeedStore(PEOPLE, GROUPS, [
    subscriber("a1", "Anna", "anna@example.com", []),
  ]);
  const [draft] = await ensureDraftsForMonth(store, JUNE, "Admin");
  assertEquals(
    draftRecipients(await store.listViewers(), draft).map((v) => v.newsletter!.email),
    ["anna@example.com"],
  );

  // A new subscriber in the same segment joins before send and is counted.
  await store.upsertViewer(subscriber("z1", "Solveig", "solveig@example.com", []));
  const sent = await markDraftSent(store, draft.id, "Admin");
  assertEquals(sent.status, "sent");
  assertEquals(sent.recipientCount, 2);
  assertEquals(sent.sentBy, "Admin");
  assert(sent.sentAt);

  await assertRejects(() =>
    updateDraftContent(store, draft.id, { subject: "x", body: "y" }, "Admin")
  );
  await assertRejects(() => regenerateDraft(store, draft.id, "Admin"));
  await assertRejects(() => markDraftSent(store, draft.id, "Admin"));

  // Idempotency key covers the month+segment: no new draft while one exists.
  assertEquals(await ensureDraftsForMonth(store, JUNE, "Admin"), []);
});

Deno.test("subscribing validates, normalizes and audits; duplicates are rejected", async () => {
  const anna: Viewer = { token: "a1", name: "Anna", groups: [], canEdit: false };
  const bo: Viewer = { token: "b1", name: "Bo", groups: [], canEdit: false };
  const expired: Viewer = {
    ...subscriber("x1", "Gone", "anna@example.com", []),
    expiredAt: "2026-01-02T00:00:00.000Z",
  };
  const store = new SeedStore(PEOPLE, GROUPS, [anna, bo, expired]);

  await assertRejects(() =>
    setNewsletterPreference(store, anna, { email: "not-an-email", groups: [] })
  );
  await assertRejects(() =>
    setNewsletterPreference(store, anna, { email: "a@b.c", groups: ["unknown"] })
  );

  // An expired viewer's email does not block; normalization lowercases/trims.
  const subscribed = await setNewsletterPreference(store, anna, {
    email: "  Anna@Example.com ",
    groups: ["dahl-siden"],
  });
  assertEquals(subscribed.newsletter?.email, "anna@example.com");
  assertEquals(subscribed.newsletter?.groups, ["dahl-siden"]);

  // Another active viewer cannot reuse the address.
  await assertRejects(() =>
    setNewsletterPreference(store, bo, { email: "ANNA@example.com", groups: [] })
  );

  // Updating keeps subscribedAt and bumps updatedAt.
  const updated = await setNewsletterPreference(store, subscribed, {
    email: "anna@example.com",
    groups: [],
  });
  assertEquals(updated.newsletter?.subscribedAt, subscribed.newsletter?.subscribedAt);
  assertEquals(updated.newsletter?.groups, []);

  const cleared = await clearNewsletterPreference(store, updated);
  assertEquals(cleared.newsletter, undefined);
  assertEquals((await store.getViewer("a1"))?.newsletter, undefined);

  const actions = (await store.listAudit()).map((entry) => entry.action);
  assertEquals(actions.includes("newsletter_subscribe"), true);
  assertEquals(actions.includes("newsletter_update"), true);
  assertEquals(actions.includes("newsletter_unsubscribe"), true);
});

Deno.test("link rotation carries the latest newsletter preference forward", async () => {
  const older = subscriber("o1", "Anna Berg", "anna@example.com", ["berg-siden"]);
  const newer = subscriber("n1", "Anna Berg", "anna2@example.com", ["dahl-siden"]);
  newer.newsletter!.updatedAt = "2026-05-01T00:00:00.000Z";
  const store = new SeedStore([], GROUPS, [older, newer]);

  const replacement = createViewer({ name: "anna berg", groups: [], canEdit: false });
  const expired = await expirePreviousViewerLinks(store, replacement);
  assertEquals(expired.length, 2);
  assertEquals(replacement.newsletter?.email, "anna2@example.com");

  await store.upsertViewer(replacement);
  for (const token of ["o1", "n1"]) {
    assert((await store.getViewer(token))?.expiredAt, "old links must expire");
  }
});
