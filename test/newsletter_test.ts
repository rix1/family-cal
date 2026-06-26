import { createViewer, expirePreviousViewerLinks } from "../lib/access_links.ts";
import type { FamilyEvent, GroupInfo, Person, Viewer } from "../lib/model.ts";
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
  generateDraftsForMonth,
  generateMissingDrafts,
  INTRO_PLACEHOLDER,
  markDraftSent,
  missingSegments,
  monthKey,
  monthOccasions,
  monthRemembrances,
  osloToday,
  parseMonthKey,
  regenerateDraft,
  segmentKey,
  sendDraft,
  setNewsletterPreference,
  subscriberSegments,
  updateDraftContent,
} from "../lib/newsletter.ts";
import type { EmailMessage, EmailSender } from "../lib/email.ts";
import type { IntroWriter } from "../lib/intro_writer.ts";
import { SeedStore } from "../lib/store.ts";
import { assert, assertEquals, assertRejects, assertStringIncludes } from "./asserts.ts";

/** Captures every message instead of sending. */
class FakeEmailSender implements EmailSender {
  messages: EmailMessage[] = [];
  // deno-lint-ignore require-await
  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }
}

const fixedIntro: IntroWriter = {
  // deno-lint-ignore require-await
  async write() {
    return "Skreddersydd intro.\n\n{{BURSDAGSLISTE}}\n\nHa en fin måned!";
  },
};

const GROUPS: GroupInfo[] = [
  { key: "berg-siden", label: "Norwegian side", color: "blue" },
  { key: "dahl-siden", label: "Danish side", color: "rose" },
];

// Following every group is now explicit (no "empty = all" magic).
const ALL = ["berg-siden", "dahl-siden"];

const PEOPLE: Person[] = [
  {
    id: "kari",
    name: "Kari",
    born: "1984-06-03",
    died: null,
    affiliation: "berg-siden",
    notes: "supersecret note",
  },
  { id: "ola", name: "Ola", born: "06-07", died: null, affiliation: "dahl-siden", notes: "" },
  {
    id: "bestemor",
    name: "Bestemor Anna",
    born: "1931-06-12",
    died: "2020-01-15",
    affiliation: "berg-siden",
    notes: "",
  },
  {
    id: "tante",
    name: "Tante Liv",
    born: "06-03",
    died: "2015-02-02",
    affiliation: "berg-siden",
    notes: "",
  },
  {
    id: "begge",
    name: "Astrid",
    born: "1992-06-20",
    died: null,
    affiliation: "dahl-siden",
    notes: "",
  },
  { id: "juli", name: "Per", born: "1990-07-01", died: null, affiliation: "berg-siden", notes: "" },
  { id: "ukjent", name: "Ukjent", born: null, died: null, affiliation: "berg-siden", notes: "" },
];

const JUNE = { year: 2026, month: 6 };

// A subscriber follows `groups` (their viewer groups) and has opted into the email.
function subscriber(token: string, name: string, email: string, groups: string[]): Viewer {
  return {
    token,
    name,
    email,
    groups,
    canEdit: false,
    newsletter: {
      email,
      subscribedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

Deno.test("oslo today crosses midnight at the right UTC offset", () => {
  assertEquals(osloToday(new Date("2026-06-23T21:59:59Z")), { year: 2026, month: 6, day: 23 });
  assertEquals(osloToday(new Date("2026-06-23T22:00:00Z")), { year: 2026, month: 6, day: 24 });
  assertEquals(osloToday(new Date("2026-12-24T22:59:59Z")), { year: 2026, month: 12, day: 24 });
  assertEquals(osloToday(new Date("2026-12-24T23:00:00Z")), { year: 2026, month: 12, day: 25 });
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
  const all = birthdaysForMonth(PEOPLE, JUNE, ALL);
  assertEquals(all.map((b) => b.personId), ["kari", "tante", "ola", "bestemor", "begge"]);
  const kari = all[0];
  assertEquals(kari.age, 42);
  assertEquals(kari.deceased, false);
  assertEquals(all.find((b) => b.personId === "ola")?.age, null);
  assertEquals(all.find((b) => b.personId === "bestemor")?.age, 95);
  assertEquals(all.find((b) => b.personId === "bestemor")?.deceased, true);

  // Following only the Danish side shows just its members; an empty follow shows nobody.
  const dansk = birthdaysForMonth(PEOPLE, JUNE, ["dahl-siden"]);
  assertEquals(dansk.map((b) => b.personId), ["ola", "begge"]);
  assertEquals(birthdaysForMonth(PEOPLE, JUNE, []), []);
});

const REMEMBERED: Person[] = [
  {
    id: "farfar",
    name: "Farfar",
    born: null,
    died: "2023-06-20",
    affiliation: "berg-siden",
    notes: "",
  },
  {
    id: "nylig",
    name: "Nylig Gått",
    born: null,
    died: "2026-06-05",
    affiliation: "berg-siden",
    notes: "",
  },
  {
    id: "annen-mnd",
    name: "Vinterbarn",
    born: null,
    died: "2018-01-02",
    affiliation: "berg-siden",
    notes: "",
  },
];

const EVENTS: FamilyEvent[] = [
  {
    id: "w1",
    kind: "wedding",
    title: "Solveig & Halvor",
    date: "2018-06-04",
    groups: ["berg-siden"],
    notes: "",
  },
  {
    id: "b1",
    kind: "baptism",
    title: "Emils dåp",
    date: "06-15",
    groups: ["dahl-siden"],
    notes: "",
  },
];

Deno.test("monthRemembrances: anniversaries from the first year onward, by group", () => {
  const june = monthRemembrances(REMEMBERED, JUNE, ALL);
  assertEquals(june.map((r) => r.personId), ["farfar"]);
  assertEquals(june[0].yearsSince, 3);

  assertEquals(monthRemembrances(REMEMBERED, JUNE, ["dahl-siden"]), []);
});

Deno.test("monthOccasions: family events recurring in the month, year known or not", () => {
  const all = monthOccasions(EVENTS, JUNE, ALL);
  assertEquals(all.map((o) => o.id), ["w1", "b1"]);
  assertEquals(all[0].yearsSince, 8);
  assertEquals(all[1].year, null);
  assertEquals(all[1].yearsSince, null);

  assertEquals(monthOccasions(EVENTS, JUNE, ["berg-siden"]).map((o) => o.id), ["w1"]);
});

Deno.test("the body notes remembrances and occasions in one sentence, never a list", () => {
  const remembrances = monthRemembrances(REMEMBERED, JUNE, ["berg-siden"]);
  const occasions = monthOccasions(EVENTS, JUNE, ["berg-siden"]);
  const body = buildBody(JUNE, [], remembrances, occasions);
  assertStringIncludes(
    body,
    "Det er også 3 år siden Farfar forlot oss (20. jun 2023) og " +
      "8 år siden Solveig & Halvor (bryllup) (4. jun 2018) denne måneden.",
  );

  assertEquals(buildBody(JUNE, []).trim().endsWith("2026"), true);
});

Deno.test("the Norwegian body lists birthdays with the right wording", () => {
  const body = buildBody(JUNE, birthdaysForMonth(PEOPLE, JUNE, ALL));
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

Deno.test("the local-model prompt passes no event data — only the month, rules and an example", () => {
  const prompt = buildPrompt(JUNE);
  assertStringIncludes(prompt, "juni 2026");
  assertStringIncludes(prompt, "bokmål");
  assertStringIncludes(prompt, "{{BURSDAGSLISTE}}"); // where the real list gets spliced in
  // The model is given no specifics at all, so it can't leak or scaffold confabulations.
  assert(!prompt.includes("Kari"), "names must not reach the model");
  assert(!prompt.includes("fyller 42"), "ages must not reach the model");
  assert(!prompt.includes("supersecret"), "private notes must not reach the model");
});

Deno.test("segments derive from active subscribers and their followed groups", () => {
  const expired: Viewer = {
    ...subscriber("x1", "Gone", "gone@example.com", ["berg-siden"]),
    expiredAt: "2026-01-02T00:00:00.000Z",
  };
  const plain: Viewer = { token: "p1", name: "No mail", groups: ["berg-siden"], canEdit: false };
  const viewers = [
    subscriber("a1", "Anna", "anna@example.com", ["berg-siden"]),
    subscriber("b1", "Bo", "bo@example.com", ["dahl-siden"]),
    subscriber("c1", "Cleo", "cleo@example.com", ["berg-siden", "dahl-siden"]),
    subscriber("d1", "Dag", "dag@example.com", ["dahl-siden", "berg-siden"]),
    expired,
    plain,
  ];
  const segments = subscriberSegments(viewers);
  assertEquals(segments.map((s) => s.key), ["berg-siden", "berg-siden+dahl-siden", "dahl-siden"]);
  assertEquals(segments[1].subscribers.length, 2);
});

Deno.test("draft generation skips segments without birthdays and has no idempotency key", async () => {
  const store = new SeedStore(PEOPLE, GROUPS, [
    subscriber("a1", "Anna", "anna@example.com", ["berg-siden", "dahl-siden"]),
    subscriber("b1", "Bo", "bo@example.com", ["dahl-siden"]),
    subscriber("e1", "Eli", "eli@example.com", ["berg-siden"]),
  ]);
  // July: only Per (berg-siden) has a birthday, so the dahl-siden-only segment is skipped.
  const july = { year: 2026, month: 7 };
  const created = await generateDraftsForMonth(store, july, "Admin");
  assertEquals(created.map((d) => `${d.month} ${d.segment}`).sort(), [
    "2026-07 berg-siden",
    "2026-07 berg-siden+dahl-siden",
  ]);
  assertEquals(created[0].status, "draft");
  assertStringIncludes(created[0].subject, "juli 2026");
  assert(created.every((d) => /^[0-9a-f-]{36}$/.test(d.id)));

  const again = await generateDraftsForMonth(store, july, "Admin");
  assertEquals(again.length, 2);
  assertEquals((await store.listNewsletterDrafts()).length, 4);
});

Deno.test("draft generation also covers segments with only a remembrance or an occasion", async () => {
  const store = new SeedStore(
    [...PEOPLE, ...REMEMBERED],
    GROUPS,
    [subscriber("a1", "Anna", "anna@example.com", ["berg-siden"])],
    [],
    EVENTS,
  );
  const noBirthdaysMonth = { year: 2026, month: 9 };
  const created = await generateDraftsForMonth(store, noBirthdaysMonth, "Admin");
  assertEquals(created, []);

  await store.upsertEvent({
    id: "w2",
    kind: "wedding",
    title: "September-bryllup",
    date: "09-10",
    groups: ["berg-siden"],
    notes: "",
  });
  const withOccasion = await generateDraftsForMonth(store, noBirthdaysMonth, "Admin");
  assertEquals(withOccasion.length, 1);
  assertStringIncludes(withOccasion[0].body, "September-bryllup (bryllup)");
});

Deno.test("drafts (and sent records) can be deleted", async () => {
  const store = new SeedStore(PEOPLE, GROUPS, [
    subscriber("a1", "Anna", "anna@example.com", ["berg-siden"]),
  ]);
  const [draft] = await generateDraftsForMonth(store, JUNE, "Admin");
  await deleteDraft(store, draft.id, "Admin");
  assertEquals(await store.listNewsletterDrafts(), []);
  await assertRejects(() => deleteDraft(store, draft.id, "Admin"));

  const [recreated] = await generateDraftsForMonth(store, JUNE, "Admin");
  await markDraftSent(store, recreated.id, "Admin");
  await deleteDraft(store, recreated.id, "Admin");
  assertEquals(await store.listNewsletterDrafts(), []);
  const actions = (await store.listAudit()).map((entry) => entry.action);
  assertEquals(actions.filter((action) => action === "newsletter_delete").length, 2);
});

Deno.test("missingSegments names segments with birthdays but no draft yet", async () => {
  const store = new SeedStore(PEOPLE, GROUPS, [
    subscriber("a1", "Anna", "anna@example.com", ["berg-siden", "dahl-siden"]),
    subscriber("b1", "Bo", "bo@example.com", ["dahl-siden"]),
    subscriber("e1", "Eli", "eli@example.com", ["berg-siden"]),
  ]);
  // July: only Per (berg-siden) has a birthday, so the dahl-siden-only segment is excluded.
  const july = { year: 2026, month: 7 };
  assertEquals((await missingSegments(store, july)).map((s) => s.key), [
    "berg-siden",
    "berg-siden+dahl-siden",
  ]);

  await generateDraftsForMonth(store, july, "Admin");
  assertEquals(await missingSegments(store, july), []);
});

Deno.test("manual edits persist; regeneration discards them after confirmation", async () => {
  const store = new SeedStore(PEOPLE, GROUPS, [
    subscriber("a1", "Anna", "anna@example.com", ["berg-siden"]),
  ]);
  const [draft] = await generateDraftsForMonth(store, JUNE, "Admin");

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
    subscriber("a1", "Anna", "anna@example.com", ["berg-siden"]),
  ]);
  const [draft] = await generateDraftsForMonth(store, JUNE, "Admin");
  assertEquals(
    draftRecipients(await store.listViewers(), draft).map((v) => v.newsletter!.email),
    ["anna@example.com"],
  );

  // A new subscriber in the same segment joins before send and is counted.
  await store.upsertViewer(subscriber("z1", "Solveig", "solveig@example.com", ["berg-siden"]));
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
});

Deno.test("subscribing uses the profile email, toggles, and audits", async () => {
  const anna: Viewer = {
    token: "a1",
    name: "Anna",
    email: "anna@example.com",
    groups: ["berg-siden"],
    canEdit: false,
  };
  const noEmail: Viewer = { token: "n1", name: "No Email", groups: ["berg-siden"], canEdit: false };
  const store = new SeedStore(PEOPLE, GROUPS, [anna, noEmail]);

  // Cannot subscribe without a profile email.
  await assertRejects(() => setNewsletterPreference(store, noEmail));

  const subscribed = await setNewsletterPreference(store, anna);
  assertEquals(subscribed.newsletter?.email, "anna@example.com");

  // Re-subscribing keeps subscribedAt (it's an update, not a fresh opt-in).
  const updated = await setNewsletterPreference(store, subscribed);
  assertEquals(updated.newsletter?.subscribedAt, subscribed.newsletter?.subscribedAt);

  const cleared = await clearNewsletterPreference(store, updated);
  assertEquals(cleared.newsletter, undefined);
  assertEquals((await store.getViewer("a1"))?.newsletter, undefined);

  const actions = (await store.listAudit()).map((entry) => entry.action);
  assertEquals(actions.includes("newsletter_subscribe"), true);
  assertEquals(actions.includes("newsletter_update"), true);
  assertEquals(actions.includes("newsletter_unsubscribe"), true);
});

Deno.test("the intro writer fills the prose; failures fall back to the placeholder", async () => {
  const store = new SeedStore(PEOPLE, GROUPS, [
    subscriber("a1", "Anna", "anna@example.com", ["berg-siden"]),
  ]);
  const [withAi] = await generateDraftsForMonth(store, JUNE, "Admin", fixedIntro);
  // The model owns intro AND closing; the placeholder is gone.
  assertStringIncludes(withAi.body, "Skreddersydd intro.");
  assertStringIncludes(withAi.body, "Ha en fin måned!");
  assert(!withAi.body.includes(INTRO_PLACEHOLDER));
  assert(!withAi.body.includes("{{BURSDAGSLISTE}}"), "the token must be substituted");
  // The deterministic list is spliced in where the token was — between intro and closing.
  assertStringIncludes(withAi.body, "## Bursdager i juni 2026");
  assert(
    withAi.body.indexOf("Skreddersydd intro.") < withAi.body.indexOf("## Bursdager i juni 2026") &&
      withAi.body.indexOf("## Bursdager i juni 2026") < withAi.body.indexOf("Ha en fin måned!"),
    "order must be intro → list → closing",
  );

  const failing: IntroWriter = { write: () => Promise.reject(new Error("boom")) };
  const store2 = new SeedStore(PEOPLE, GROUPS, [
    subscriber("a1", "Anna", "anna@example.com", ["berg-siden"]),
  ]);
  const [fallback] = await generateDraftsForMonth(store2, JUNE, "Admin", failing);
  assertStringIncludes(fallback.body, INTRO_PLACEHOLDER);
});

Deno.test("generateMissingDrafts is idempotent", async () => {
  const store = new SeedStore(PEOPLE, GROUPS, [
    subscriber("a1", "Anna", "anna@example.com", ["berg-siden"]),
  ]);
  const first = await generateMissingDrafts(store, JUNE, "Scheduler");
  assert(first.length >= 1);
  const again = await generateMissingDrafts(store, JUNE, "Scheduler");
  assertEquals(again.length, 0);
  assertEquals((await store.listNewsletterDrafts()).length, first.length);
});

Deno.test("sendDraft emails each recipient with an unsubscribe footer, then freezes", async () => {
  const store = new SeedStore(PEOPLE, GROUPS, [
    subscriber("a1", "Anna", "anna@example.com", ["berg-siden"]),
    subscriber("z1", "Solveig", "solveig@example.com", ["berg-siden"]),
  ]);
  const [draft] = await generateDraftsForMonth(store, JUNE, "Admin");
  const sender = new FakeEmailSender();

  const sent = await sendDraft(store, draft.id, "Admin", sender);
  assertEquals(sent.status, "sent");
  assertEquals(sender.messages.map((m) => m.to).sort(), ["anna@example.com", "solveig@example.com"]);
  assertStringIncludes(sender.messages[0].text, "Administrer eller meld deg av");
  assert(sender.messages[0].headers?.["List-Unsubscribe"]);
  assert(sender.messages[0].html?.includes("Bursdager"));

  // Immutable once sent.
  await assertRejects(() => sendDraft(store, draft.id, "Admin", sender));
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
