/**
 * Monthly birthday newsletter: subscription preferences, audience segments,
 * Norwegian draft generation, and the draft lifecycle. Everything here is
 * derived from `Person.born` and viewer preferences at generation time;
 * drafts only freeze content once marked sent.
 */

import { pad2, splitDate } from "./dates.ts";
import { type NewsletterDraft, type Person, type Viewer, viewerIsActive } from "./model.ts";
import { ValidationError } from "./people.ts";
import type { Store } from "./store.ts";

// --- Email ---

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) {
    throw new ValidationError(`invalid email "${String(value)}"`);
  }
  return email;
}

// --- Months in the Europe/Oslo timezone ---

export interface MonthRef {
  year: number;
  /** 1–12. */
  month: number;
}

const osloFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date in Europe/Oslo for an instant (en-CA formats as YYYY-MM-DD). */
export function osloToday(now = new Date()): { year: number; month: number; day: number } {
  const [year, month, day] = osloFormatter.format(now).split("-").map(Number);
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthKey(ref: MonthRef): string {
  return `${ref.year}-${pad2(ref.month)}`;
}

export function parseMonthKey(key: string): MonthRef | null {
  if (!/^\d{4}-\d{2}$/.test(key)) return null;
  const [year, month] = key.split("-").map(Number);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function addMonths(ref: MonthRef, delta: number): MonthRef {
  const total = ref.year * 12 + (ref.month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12 + 12) % 12 + 1 };
}

/** True when `now` (Oslo) falls in the final `leadDays` calendar days of its month. */
export function inLeadWindow(now: Date, leadDays: number): boolean {
  const today = osloToday(now);
  return today.day > daysInMonth(today.year, today.month) - leadDays;
}

export function normalizeLeadDays(value: unknown): number {
  const leadDays = Number(value);
  if (!Number.isInteger(leadDays) || leadDays < 1 || leadDays > 28) {
    throw new ValidationError("lead time must be a whole number of days from 1 to 28");
  }
  return leadDays;
}

// --- Audience segments ---

/** Sorted, deduplicated, non-empty group keys — the normalized form. */
export function canonicalGroups(groups: string[]): string[] {
  return [...new Set(groups.map((group) => group.trim()).filter(Boolean))].sort();
}

/** Canonical segment key for a set of newsletter groups. Empty = `all`. */
export function segmentKey(groups: string[]): string {
  const canonical = canonicalGroups(groups);
  return canonical.length ? canonical.join("+") : "all";
}

export function activeSubscribers(viewers: Viewer[]): Viewer[] {
  return viewers.filter((viewer) => viewerIsActive(viewer) && viewer.newsletter);
}

export interface Segment {
  key: string;
  groups: string[];
  subscribers: Viewer[];
}

/** Distinct normalized group combinations among active subscribers. */
export function subscriberSegments(viewers: Viewer[]): Segment[] {
  const segments = new Map<string, Segment>();
  for (const viewer of activeSubscribers(viewers)) {
    const groups = canonicalGroups(viewer.newsletter!.groups);
    const key = segmentKey(groups);
    const segment = segments.get(key) ?? { key, groups, subscribers: [] };
    segment.subscribers.push(viewer);
    segments.set(key, segment);
  }
  return [...segments.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Current recipients of a draft; dynamic until the draft is marked sent. */
export function draftRecipients(viewers: Viewer[], draft: NewsletterDraft): Viewer[] {
  return activeSubscribers(viewers).filter(
    (viewer) => segmentKey(viewer.newsletter!.groups) === draft.segment,
  );
}

// --- Birthdays for a month ---

export interface MonthBirthday {
  personId: string;
  name: string;
  day: number;
  /** The age turned this year, when the birth year is known. */
  age: number | null;
  deceased: boolean;
}

/**
 * Birthdays in `month` visible to `groups` (any selected group matches; empty
 * = everyone), chronological, then by name. Only `born` matters here: notes,
 * death anniversaries, holidays and family events stay out of the newsletter.
 */
export function birthdaysForMonth(
  people: Person[],
  month: MonthRef,
  groups: string[],
): MonthBirthday[] {
  const visible = groups.length
    ? people.filter((person) => person.groups.some((group) => groups.includes(group)))
    : people;
  const out: MonthBirthday[] = [];
  const seen = new Set<string>();
  for (const person of visible) {
    if (seen.has(person.id)) continue;
    seen.add(person.id);
    const parts = splitDate(person.born);
    if (!parts || parts.month !== month.month) continue;
    const age = parts.year !== null ? month.year - parts.year : null;
    out.push({
      personId: person.id,
      name: person.name,
      day: parts.day,
      age: age !== null && age >= 0 ? age : null,
      deceased: Boolean(person.died),
    });
  }
  return out.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, "nb"));
}

// --- Norwegian (bokmål) rendering ---

const MONTHS_NB = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
];

export function monthNameNb(month: number): string {
  return MONTHS_NB[month - 1];
}

export function defaultSubject(month: MonthRef): string {
  return `Familiekalenderen: bursdager i ${monthNameNb(month.month)} ${month.year}`;
}

export const INTRO_PLACEHOLDER = "_Skriv en kort introduksjon her._";

function birthdayLine(birthday: MonthBirthday, month: MonthRef): string {
  const date = `**${birthday.day}. ${monthNameNb(month.month)}**`;
  if (birthday.deceased) {
    return birthday.age !== null
      ? `- ${date} – ${birthday.name} ville ha fylt ${birthday.age} år`
      : `- ${date} – til minne om ${birthday.name}`;
  }
  return birthday.age !== null
    ? `- ${date} – ${birthday.name} fyller ${birthday.age} år`
    : `- ${date} – ${birthday.name} har bursdag`;
}

export function buildBody(month: MonthRef, birthdays: MonthBirthday[]): string {
  return [
    INTRO_PLACEHOLDER,
    "",
    `## Bursdager i ${monthNameNb(month.month)} ${month.year}`,
    "",
    ...birthdays.map((birthday) => birthdayLine(birthday, month)),
    "",
  ].join("\n");
}

/**
 * Copyable prompt for drafting the introduction with an LLM. Deliberately
 * anonymous: only the month, the number of birthdays, and bare dates — never
 * names, ages, birth years, emails, notes, or group labels.
 */
export function buildPrompt(month: MonthRef, birthdays: MonthBirthday[]): string {
  const byDay = new Map<number, number>();
  for (const birthday of birthdays) {
    byDay.set(birthday.day, (byDay.get(birthday.day) ?? 0) + 1);
  }
  const dates = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, count]) =>
      `${day}. ${monthNameNb(month.month)}${count > 1 ? ` (${count} bursdager)` : ""}`
    )
    .join(", ");
  return [
    "Skriv en varm introduksjon på 2–3 setninger til et månedlig nyhetsbrev " +
    "om bursdager i familien. Svar på norsk (bokmål).",
    "",
    `Måned: ${monthNameNb(month.month)} ${month.year}`,
    `Antall bursdager: ${birthdays.length}`,
    `Datoer: ${dates}`,
    "",
    "Ikke finn på navn, fakta eller hendelser, og ikke omtal enkeltpersoner. " +
    "Svar kun med selve introduksjonen.",
  ].join("\n");
}

// --- Draft lifecycle ---

/**
 * Idempotently create next-month/manual drafts: one per distinct subscriber
 * segment, skipping segments that already have a draft for the month and
 * segments with no birthdays. Draft ids are opaque (URL-safe) — the
 * `(month, segment)` pair is the natural key. Returns only newly created
 * drafts.
 */
export async function ensureDraftsForMonth(
  store: Store,
  month: MonthRef,
  actor: string,
): Promise<NewsletterDraft[]> {
  const [viewers, people, drafts] = await Promise.all([
    store.listViewers(),
    store.listPeople(),
    store.listNewsletterDrafts(),
  ]);
  const existing = new Set(drafts.map((draft) => `${draft.month}|${draft.segment}`));
  const created: NewsletterDraft[] = [];
  for (const segment of subscriberSegments(viewers)) {
    if (existing.has(`${monthKey(month)}|${segment.key}`)) continue;
    const birthdays = birthdaysForMonth(people, month, segment.groups);
    if (!birthdays.length) continue;
    const now = new Date().toISOString();
    const draft: NewsletterDraft = {
      id: crypto.randomUUID(),
      month: monthKey(month),
      segment: segment.key,
      subject: defaultSubject(month),
      body: buildBody(month, birthdays),
      prompt: buildPrompt(month, birthdays),
      groups: segment.groups,
      createdAt: now,
      updatedAt: now,
      status: "draft",
    };
    await store.upsertNewsletterDraft(draft);
    await store.appendAudit({
      at: now,
      actor,
      action: "newsletter_generate",
      targetId: draft.id,
      detail: `Draft for ${draft.month} (${segment.key}), ${birthdays.length} birthdays`,
    });
    created.push(draft);
  }
  return created;
}

async function editableDraft(store: Store, id: string): Promise<NewsletterDraft> {
  const draft = await store.getNewsletterDraft(id);
  if (!draft) throw new ValidationError("newsletter draft not found");
  if (draft.status === "sent") {
    throw new ValidationError("this newsletter has been sent and can no longer change");
  }
  return draft;
}

/** Save manual subject/body edits on an unsent draft. */
export async function updateDraftContent(
  store: Store,
  id: string,
  input: { subject: string; body: string },
  actor: string,
): Promise<NewsletterDraft> {
  const draft = await editableDraft(store, id);
  const subject = input.subject.trim();
  if (!subject) throw new ValidationError("subject is required");
  const now = new Date().toISOString();
  const next: NewsletterDraft = { ...draft, subject, body: input.body, updatedAt: now };
  await store.upsertNewsletterDraft(next);
  await store.appendAudit({
    at: now,
    actor,
    action: "newsletter_edit",
    targetId: id,
    detail: `Edited draft for ${draft.month} (${draft.segment})`,
  });
  return next;
}

/**
 * Replace subject, body and prompt from current birthday data, discarding any
 * manual edits. Only valid on unsent drafts.
 */
export async function regenerateDraft(
  store: Store,
  id: string,
  actor: string,
): Promise<NewsletterDraft> {
  const draft = await editableDraft(store, id);
  const month = parseMonthKey(draft.month);
  if (!month) throw new ValidationError(`draft has an invalid month "${draft.month}"`);
  const birthdays = birthdaysForMonth(await store.listPeople(), month, draft.groups);
  const now = new Date().toISOString();
  const next: NewsletterDraft = {
    ...draft,
    subject: defaultSubject(month),
    body: buildBody(month, birthdays),
    prompt: buildPrompt(month, birthdays),
    updatedAt: now,
  };
  await store.upsertNewsletterDraft(next);
  await store.appendAudit({
    at: now,
    actor,
    action: "newsletter_regenerate",
    targetId: id,
    detail: `Regenerated draft for ${draft.month} (${draft.segment})`,
  });
  return next;
}

/**
 * Delete a draft (sent or not). Note: while a deleted month/segment still has
 * subscribers and birthdays, generation — including the lead-window autogen —
 * will recreate it; deletion is for drafts whose audience no longer exists or
 * that were created by mistake.
 */
export async function deleteDraft(store: Store, id: string, actor: string): Promise<void> {
  const draft = await store.getNewsletterDraft(id);
  if (!draft) throw new ValidationError("newsletter draft not found");
  await store.deleteNewsletterDraft(id);
  await store.appendAudit({
    at: new Date().toISOString(),
    actor,
    action: "newsletter_delete",
    targetId: id,
    detail: `Deleted ${draft.status} for ${draft.month} (${draft.segment})`,
  });
}

/** Freeze a draft as sent, recording sender, time and the recipient count. */
export async function markDraftSent(
  store: Store,
  id: string,
  actor: string,
): Promise<NewsletterDraft> {
  const draft = await editableDraft(store, id);
  const recipients = draftRecipients(await store.listViewers(), draft);
  const now = new Date().toISOString();
  const next: NewsletterDraft = {
    ...draft,
    status: "sent",
    sentAt: now,
    sentBy: actor,
    recipientCount: recipients.length,
    updatedAt: now,
  };
  await store.upsertNewsletterDraft(next);
  await store.appendAudit({
    at: now,
    actor,
    action: "newsletter_sent",
    targetId: id,
    detail: `Sent ${draft.month} (${draft.segment}) to ${recipients.length} recipients`,
  });
  return next;
}

// --- Subscription preferences ---

/**
 * Subscribe or update the viewer's newsletter preference. Rejects emails that
 * another active viewer already subscribed with.
 */
export async function setNewsletterPreference(
  store: Store,
  viewer: Viewer,
  input: { email: unknown; groups: string[] },
): Promise<Viewer> {
  const email = normalizeEmail(input.email);
  const knownGroups = new Set((await store.listGroups()).map((group) => group.key));
  const groups = canonicalGroups(input.groups);
  for (const group of groups) {
    if (!knownGroups.has(group)) throw new ValidationError(`unknown group "${group}"`);
  }

  const others = activeSubscribers(await store.listViewers())
    .filter((other) => other.token !== viewer.token);
  if (others.some((other) => other.newsletter!.email === email)) {
    throw new ValidationError("another family member already subscribed with this email");
  }

  const now = new Date().toISOString();
  const next: Viewer = {
    ...viewer,
    newsletter: {
      email,
      groups,
      subscribedAt: viewer.newsletter?.subscribedAt ?? now,
      updatedAt: now,
    },
  };
  await store.upsertViewer(next);
  await store.appendAudit({
    at: now,
    actor: viewer.name,
    action: viewer.newsletter ? "newsletter_update" : "newsletter_subscribe",
    detail: `Newsletter groups: ${groups.join(", ") || "all"}`,
  });
  return next;
}

/** Unsubscribe immediately. No-op when not subscribed. */
export async function clearNewsletterPreference(store: Store, viewer: Viewer): Promise<Viewer> {
  if (!viewer.newsletter) return viewer;
  const { newsletter: _, ...rest } = viewer;
  const next: Viewer = { ...rest };
  await store.upsertViewer(next);
  await store.appendAudit({
    at: new Date().toISOString(),
    actor: viewer.name,
    action: "newsletter_unsubscribe",
  });
  return next;
}
