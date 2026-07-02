/**
 * Monthly birthday newsletter: subscription preferences, audience segments,
 * Norwegian draft generation, and the draft lifecycle. Everything here is
 * derived from `Person.born` and viewer preferences at generation time;
 * drafts only freeze content once marked sent.
 */

import { render } from "@deno/gfm";
import { pad2, splitDate } from "./dates.ts";
import type { EmailMessage, EmailSender } from "./email.ts";
import { fillNewsletterEmail } from "./newsletter_email.ts";
import type { IntroWriter, WriteEvent } from "./intro_writer.ts";
import { stripReasoning } from "./intro_writer.ts";
import {
  type EventKind,
  type FamilyEvent,
  type NewsletterDraft,
  type Person,
  type Viewer,
  viewerIsActive,
} from "./model.ts";
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
    const groups = canonicalGroups(viewer.groups);
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
    (viewer) => segmentKey(viewer.groups) === draft.segment,
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
 * = everyone), chronological, then by name. Only `born` matters here: death
 * anniversaries and family events are handled separately by
 * `monthRemembrances`/`monthOccasions`; notes and holidays stay out of the
 * newsletter entirely.
 */
export function birthdaysForMonth(
  people: Person[],
  month: MonthRef,
  groups: string[],
): MonthBirthday[] {
  const followed = new Set(groups);
  const visible = people.filter((person) => followed.has(person.affiliation));
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

// --- Death anniversaries and family events for a month ---

export interface MonthRemembrance {
  personId: string;
  name: string;
  day: number;
  year: number;
  yearsSince: number;
}

/**
 * Death anniversaries in `month` visible to `groups`, first anniversary
 * onward (the month someone dies is grief, not yet an anniversary).
 */
export function monthRemembrances(
  people: Person[],
  month: MonthRef,
  groups: string[],
): MonthRemembrance[] {
  const followed = new Set(groups);
  const visible = people.filter((person) => followed.has(person.affiliation));
  const out: MonthRemembrance[] = [];
  for (const person of visible) {
    const parts = splitDate(person.died);
    if (!parts || parts.month !== month.month || parts.year === null) continue;
    const yearsSince = month.year - parts.year;
    if (yearsSince < 1) continue;
    out.push({
      personId: person.id,
      name: person.name,
      day: parts.day,
      year: parts.year,
      yearsSince,
    });
  }
  return out.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, "nb"));
}

export interface MonthOccasion {
  id: string;
  kind: EventKind;
  title: string;
  day: number;
  year: number | null;
  /** Years since the first occurrence, when the year is known and has passed. */
  yearsSince: number | null;
}

/** Explicit family events (weddings, baptisms, ...) recurring in `month`, visible to `groups`. */
export function monthOccasions(
  events: FamilyEvent[],
  month: MonthRef,
  groups: string[],
): MonthOccasion[] {
  const followed = new Set(groups);
  const visible = events.filter((event) => event.groups.some((group) => followed.has(group)));
  const out: MonthOccasion[] = [];
  for (const event of visible) {
    const parts = splitDate(event.date);
    if (!parts || parts.month !== month.month) continue;
    const yearsSince = parts.year !== null ? month.year - parts.year : null;
    out.push({
      id: event.id,
      kind: event.kind,
      title: event.title,
      day: parts.day,
      year: parts.year,
      yearsSince: yearsSince !== null && yearsSince >= 1 ? yearsSince : null,
    });
  }
  return out.sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, "nb"));
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

const MONTHS_NB_SHORT = [
  "jan",
  "feb",
  "mar",
  "apr",
  "mai",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "des",
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

/** Norwegian (bokmål) list join: "a", "a og b", "a, b og c". */
function joinNb(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} og ${items.at(-1)}`;
}

const EVENT_KIND_LABELS_NB: Partial<Record<EventKind, string>> = {
  wedding: "bryllup",
  baptism: "dåp",
  confirmation: "konfirmasjon",
};

function remembrancePhrase(month: MonthRef, remembrance: MonthRemembrance): string {
  const date = `${remembrance.day}. ${MONTHS_NB_SHORT[month.month - 1]} ${remembrance.year}`;
  return `${remembrance.yearsSince} år siden ${remembrance.name} forlot oss (${date})`;
}

function occasionPhrase(month: MonthRef, occasion: MonthOccasion): string {
  const kindLabel = EVENT_KIND_LABELS_NB[occasion.kind];
  const label = kindLabel ? `${occasion.title} (${kindLabel})` : occasion.title;
  const date = occasion.year
    ? `${occasion.day}. ${MONTHS_NB_SHORT[month.month - 1]} ${occasion.year}`
    : `${occasion.day}. ${MONTHS_NB_SHORT[month.month - 1]}`;
  return occasion.yearsSince
    ? `${occasion.yearsSince} år siden ${label} (${date})`
    : `${label} (${date})`;
}

/**
 * One tasteful sentence noting death anniversaries and family events for the
 * month — never a bulleted list, since each carries a name or two rather
 * than the dozens a birthday list can hold.
 */
function buildRemembranceSentence(
  month: MonthRef,
  remembrances: MonthRemembrance[],
  occasions: MonthOccasion[],
): string {
  const items = [
    ...remembrances.map((remembrance) => remembrancePhrase(month, remembrance)),
    ...occasions.map((occasion) => occasionPhrase(month, occasion)),
  ];
  if (!items.length) return "";
  return `Det er også ${joinNb(items)} denne måneden.`;
}

/**
 * Token the local model emits where the dated list should go; we substitute it
 * for `buildDateListBlock` so the model owns the prose but never the facts.
 */
export const BIRTHDAY_LIST_TOKEN = "{{BURSDAGSLISTE}}";

/** Fixed closing line every newsletter ends with (no invented sender). */
export const NEWSLETTER_SIGN_OFF = "Ha en fin måned!";

/**
 * The authoritative, deterministic block of dated facts (birthday heading + lines,
 * plus the remembrance/occasion sentence). Never written by the model.
 */
function buildDateListBlock(
  month: MonthRef,
  birthdays: MonthBirthday[],
  remembrances: MonthRemembrance[],
  occasions: MonthOccasion[],
): string {
  const lines = [`## Bursdager i ${monthNameNb(month.month)} ${month.year}`];
  if (birthdays.length) {
    lines.push("", ...birthdays.map((birthday) => birthdayLine(birthday, month)));
  }
  const sentence = buildRemembranceSentence(month, remembrances, occasions);
  if (sentence) lines.push("", sentence);
  return lines.join("\n");
}

/**
 * Assemble the newsletter body. The local model writes the full prose (intro +
 * closing) with a `BIRTHDAY_LIST_TOKEN` marking where the dated list goes; we swap
 * the token for the deterministic `buildDateListBlock`. Fallbacks keep the facts
 * intact whatever the model did:
 *  - token present → substitute it (and drop any stray duplicates).
 *  - model prose but no token → append the block after the prose.
 *  - no model prose (no writer / failure) → placeholder intro + block.
 */
export function buildBody(
  month: MonthRef,
  birthdays: MonthBirthday[],
  remembrances: MonthRemembrance[] = [],
  occasions: MonthOccasion[] = [],
  body: string | null = null,
): string {
  const block = buildDateListBlock(month, birthdays, remembrances, occasions);
  if (!body?.trim()) {
    // No model prose — deterministic stub for a human to fill in (no sign-off).
    return `${INTRO_PLACEHOLDER}\n\n${block}\n`;
  }
  const prose = body.includes(BIRTHDAY_LIST_TOKEN)
    ? body.replace(BIRTHDAY_LIST_TOKEN, block).replaceAll(BIRTHDAY_LIST_TOKEN, "")
    : `${body.trim()}\n\n${block}`;
  // Guarantee the fixed sign-off as the final line — the model tends to invent its
  // own closing, so we own it (and the prompt tells the model to skip one).
  const trimmed = prose.trim();
  const withSignOff = trimmed.endsWith(NEWSLETTER_SIGN_OFF)
    ? trimmed
    : `${trimmed}\n\n${NEWSLETTER_SIGN_OFF}`;
  return `${withSignOff}\n`;
}

/**
 * Prompt for the LOCAL model to draft the WHOLE email body (intro + closing). It
 * deliberately passes NO event data at all — not even counts — only the month, firm
 * rules and a one-shot example. With nothing concrete to scaffold on, a small model
 * is far less likely to confabulate fake names/dates (which it does about half the
 * time when given any specifics). The model marks where the dated list goes with
 * `BIRTHDAY_LIST_TOKEN`; `buildBody` swaps in the authoritative list.
 */
export function buildPrompt(month: MonthRef): string {
  const when = `${monthNameNb(month.month)} ${month.year}`;
  return [
    `Du skriver hele teksten til et privat månedlig nyhetsbrev som sendes til 20–30 ` +
    `familiemedlemmer noen få dager FØR ${when} begynner. Skriv i forventning om måneden ` +
    `som kommer – ikke som om den allerede er i gang.`,
    "",
    `Tone: leken, lett og varm, på norsk (bokmål). Skriv på vegne av hele familien ` +
    `(«vi»/«oss»), ikke som én enkelt person, og ikke finn på en avsender, et navn eller et sted.`,
    "",
    `Format: kun korte, sammenhengende avsnitt i vanlig tekst – ingen overskrifter, ` +
    `kulepunkter, lister, signatur eller P.S. Omtrent to korte avsnitt før lista og ett ` +
    `kort avsnitt etter.`,
    "",
    `VIKTIG: Du har ingen informasjon om hvem som har bursdag eller når. Ikke nevn navn, ` +
    `datoer, alder, årstall eller antall, og ikke gjett eller dikt opp slikt – den daterte ` +
    `lista under fyller inn alt det konkrete. Hold deg til en generell, varm ` +
    `årstidsstemning som passer måneden.`,
    "",
    `Der lista skal stå, setter du inn dette symbolet på en egen linje:`,
    BIRTHDAY_LIST_TOKEN,
    "",
    `Vi bytter ut symbolet med den ekte lista og legger til avslutningshilsenen selv.`,
    "",
    `Eksempel (for en annen måned – følg formen og tonen, ikke det konkrete innholdet):`,
    "---",
    `Hei, kjære familie!`,
    "",
    `Snart er det februar, og selv om vinteren fortsatt holder et godt grep, er det noe ` +
    `fint med de lange, rolige kveldene. Vi håper dere får kost dere med varm drikke og ` +
    `godt selskap i tiden som kommer.`,
    "",
    `Som alltid er det noen datoer verdt å merke seg i måneden som kommer – ta en titt nedenfor.`,
    "",
    BIRTHDAY_LIST_TOKEN,
    "",
    `Vi sender varme tanker til hver og en av dere, og gleder oss til alt den nye måneden ` +
    `har å by på.`,
    "---",
    "",
    `Nå skriver du en tilsvarende tekst for ${when}. Svar kun med selve nyhetsbrev-teksten ` +
    `(innledning, ${BIRTHDAY_LIST_TOKEN}, kort avslutning). Ingen overskrift øverst.`,
  ].join("\n");
}

/**
 * Full email body from the writer (model's chain-of-thought stripped), or null on
 * no writer / failure / empty output — callers fall back to the deterministic body.
 */
async function writeBody(
  introWriter: IntroWriter | null | undefined,
  month: MonthRef,
  onModelEvent?: (event: WriteEvent) => void,
): Promise<string | null> {
  if (!introWriter) return null;
  const key = monthKey(month);
  const started = Date.now();
  console.info(`[newsletter] ${key}: generating prose with the local model…`);
  try {
    const out = stripReasoning(await introWriter.write(buildPrompt(month), onModelEvent));
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (out) {
      console.info(`[newsletter] ${key}: prose ready in ${secs}s (${out.length} chars).`);
      return out;
    }
    console.warn(`[newsletter] ${key}: model returned empty after ${secs}s → placeholder.`);
    return null;
  } catch (error) {
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[newsletter] ${key}: model failed after ${secs}s → placeholder: ${reason}`);
    return null;
  }
}

// --- Draft lifecycle ---

/**
 * Build and store one draft for `segment`, or null when the segment has nothing
 * (no birthdays, remembrances or occasions) that month. The intro prose comes
 * from `introWriter` (local model), falling back to the placeholder.
 */
async function createSegmentDraft(
  store: Store,
  month: MonthRef,
  segment: Segment,
  people: Person[],
  events: FamilyEvent[],
  actor: string,
  introWriter?: IntroWriter | null,
): Promise<NewsletterDraft | null> {
  const birthdays = birthdaysForMonth(people, month, segment.groups);
  const remembrances = monthRemembrances(people, month, segment.groups);
  const occasions = monthOccasions(events, month, segment.groups);
  if (!birthdays.length && !remembrances.length && !occasions.length) return null;

  const modelBody = await writeBody(introWriter, month);
  const now = new Date().toISOString();
  const draft: NewsletterDraft = {
    id: crypto.randomUUID(),
    month: monthKey(month),
    segment: segment.key,
    subject: defaultSubject(month),
    body: buildBody(month, birthdays, remembrances, occasions, modelBody),
    prompt: buildPrompt(month),
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
  return draft;
}

/**
 * Create one draft per distinct subscriber segment with content in `month`. No
 * dedup against existing drafts — generating the same month again adds more;
 * use `generateMissingDrafts` for the idempotent (cron) path.
 */
export async function generateDraftsForMonth(
  store: Store,
  month: MonthRef,
  actor: string,
  introWriter?: IntroWriter | null,
): Promise<NewsletterDraft[]> {
  const [viewers, people, events] = await Promise.all([
    store.listViewers(),
    store.listPeople(),
    store.listEvents(),
  ]);
  const created: NewsletterDraft[] = [];
  for (const segment of subscriberSegments(viewers)) {
    const draft = await createSegmentDraft(
      store,
      month,
      segment,
      people,
      events,
      actor,
      introWriter,
    );
    if (draft) created.push(draft);
  }
  return created;
}

/**
 * Idempotent generation for automation: create drafts only for segments that
 * have content but no draft for `month` yet. Safe to run repeatedly.
 */
export async function generateMissingDrafts(
  store: Store,
  month: MonthRef,
  actor: string,
  introWriter?: IntroWriter | null,
): Promise<NewsletterDraft[]> {
  const segments = await missingSegments(store, month);
  if (!segments.length) return [];
  const [people, events] = await Promise.all([store.listPeople(), store.listEvents()]);
  const created: NewsletterDraft[] = [];
  for (const segment of segments) {
    const draft = await createSegmentDraft(
      store,
      month,
      segment,
      people,
      events,
      actor,
      introWriter,
    );
    if (draft) created.push(draft);
  }
  return created;
}

/**
 * Subscriber segments with birthdays, death anniversaries or family events in
 * `month` that have no draft yet — surfaced as an informational nudge, not
 * auto-generated.
 */
export async function missingSegments(store: Store, month: MonthRef): Promise<Segment[]> {
  const [viewers, people, events, drafts] = await Promise.all([
    store.listViewers(),
    store.listPeople(),
    store.listEvents(),
    store.listNewsletterDrafts(),
  ]);
  const key = monthKey(month);
  const existing = new Set(
    drafts.filter((draft) => draft.month === key).map((draft) => draft.segment),
  );
  return subscriberSegments(viewers).filter((segment) =>
    !existing.has(segment.key) && (
      birthdaysForMonth(people, month, segment.groups).length ||
      monthRemembrances(people, month, segment.groups).length ||
      monthOccasions(events, month, segment.groups).length
    )
  );
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

/** Milestones reported by `regenerateDraft`, in order, to drive a progress UI. */
export type RegenStep = "collected" | "written" | "saved";

/**
 * Replace subject, body and prompt from current data, discarding manual edits,
 * and re-draft the intro with `introWriter` (local model). Only valid on unsent
 * drafts. This backs the admin "Generate" button. `onProgress` fires as each
 * milestone completes so the UI can show real per-step progress (the model call
 * is the slow one); `onModelEvent` forwards the raw model request and streamed
 * tokens so the UI can show a live log.
 */
export async function regenerateDraft(
  store: Store,
  id: string,
  actor: string,
  introWriter?: IntroWriter | null,
  onProgress?: (step: RegenStep) => void,
  onModelEvent?: (event: WriteEvent) => void,
): Promise<NewsletterDraft> {
  const draft = await editableDraft(store, id);
  const month = parseMonthKey(draft.month);
  if (!month) throw new ValidationError(`draft has an invalid month "${draft.month}"`);
  const [people, events] = await Promise.all([store.listPeople(), store.listEvents()]);
  const birthdays = birthdaysForMonth(people, month, draft.groups);
  const remembrances = monthRemembrances(people, month, draft.groups);
  const occasions = monthOccasions(events, month, draft.groups);
  onProgress?.("collected");
  const modelBody = await writeBody(introWriter, month, onModelEvent);
  onProgress?.("written");
  const now = new Date().toISOString();
  const next: NewsletterDraft = {
    ...draft,
    subject: defaultSubject(month),
    body: buildBody(month, birthdays, remembrances, occasions, modelBody),
    prompt: buildPrompt(month),
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
  onProgress?.("saved");
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

/**
 * Render a draft's Markdown body to HTML for email or preview. Same as gfm's
 * `render`, but strips the clickable heading anchors it injects (an octicon
 * `<a class="anchor" href="#…">`): a docs affordance that's just a broken
 * in-email fragment link in a newsletter.
 */
export function renderNewsletterHtml(markdown: string): string {
  return render(markdown).replaceAll(/<a class="anchor"[\s\S]*?<\/a>/g, "");
}

/**
 * Plain-text unsubscribe footer for the `text` part. The HTML footer lives in the
 * email template (`fillNewsletterEmail`), which owns the visual chrome.
 */
function unsubscribeFooter(profileUrl: string): string {
  return `\n\n—\nAdministrer eller meld deg av: ${profileUrl}`;
}

/** Preheader / inbox snippet shown for the newsletter. */
const NEWSLETTER_PREVIEW = "Hvem skal feires denne måneden – og litt om det som venter oss.";

/**
 * Build the email for a draft: the local HTML template (`fillNewsletterEmail`)
 * for the rich `html`, plus a plain-text `text` fallback with the unsubscribe
 * footer. The template owns the visual header/footer, so its `content` is just
 * the rendered body.
 */
function newsletterMessage(
  draft: NewsletterDraft,
  to: string,
  subject: string,
  profileUrl: string,
): EmailMessage {
  const month = parseMonthKey(draft.month);
  const html = fillNewsletterEmail({
    preview: NEWSLETTER_PREVIEW,
    title: month ? `Bursdager i ${monthNameNb(month.month)}` : draft.subject,
    issue_number: month ? `#${month.month}` : "",
    issue_date: month ? `${monthNameNb(month.month)} ${month.year}` : draft.month,
    content: renderNewsletterHtml(draft.body),
    unsubscribe_url: profileUrl,
  });
  return {
    to,
    subject,
    text: `${draft.body}${unsubscribeFooter(profileUrl)}`,
    html,
    headers: { "List-Unsubscribe": `<${profileUrl}>` },
  };
}

/**
 * Deliver an unsent draft to its current recipients via `sender` (one message
 * each, with an unsubscribe footer + List-Unsubscribe header), then freeze it as
 * sent. A failed recipient is logged and skipped; the rest still go out.
 */
export async function sendDraft(
  store: Store,
  id: string,
  actor: string,
  sender: EmailSender,
): Promise<NewsletterDraft> {
  const draft = await editableDraft(store, id);
  const recipients = draftRecipients(await store.listViewers(), draft);
  const baseUrl = (Deno.env.get("BASE_URL") ?? "").replace(/\/+$/, "");
  const profileUrl = `${baseUrl}/profile`;

  for (const recipient of recipients) {
    try {
      await sender.send(
        newsletterMessage(draft, recipient.newsletter!.email, draft.subject, profileUrl),
      );
    } catch (error) {
      console.error(`Newsletter send failed for ${recipient.newsletter!.email}:`, error);
    }
  }
  return markDraftSent(store, id, actor);
}

/**
 * Deliver the draft's current content to a single address as a preview. Unlike
 * `sendDraft` this never freezes the draft or touches the recipient list — it's a
 * dry run to your own inbox. Mirrors the real email (unsubscribe footer +
 * List-Unsubscribe header) but prefixes the subject with "[Test]" so it can't be
 * mistaken for the real thing. Valid on unsent drafts only.
 */
export async function sendTestDraft(
  store: Store,
  id: string,
  to: string,
  actor: string,
  sender: EmailSender,
): Promise<string> {
  const draft = await editableDraft(store, id);
  const email = normalizeEmail(to);
  const baseUrl = (Deno.env.get("BASE_URL") ?? "").replace(/\/+$/, "");
  const profileUrl = `${baseUrl}/profile`;
  await sender.send(newsletterMessage(draft, email, `[Test] ${draft.subject}`, profileUrl));
  await store.appendAudit({
    at: new Date().toISOString(),
    actor,
    action: "newsletter_test_send",
    targetId: id,
    detail: `Sent test of ${draft.month} (${draft.segment}) to ${email}`,
  });
  return email;
}

// --- Subscription preferences ---

/**
 * Subscribe the viewer to the monthly email at their profile address. The digest
 * audience follows the viewer's groups, so there is nothing to choose here — it's
 * a plain opt-in. No-op-friendly: re-subscribing just refreshes `updatedAt`.
 */
export async function setNewsletterPreference(store: Store, viewer: Viewer): Promise<Viewer> {
  const email = normalizeEmail(viewer.email);

  const now = new Date().toISOString();
  const next: Viewer = {
    ...viewer,
    newsletter: {
      email,
      subscribedAt: viewer.newsletter?.subscribedAt ?? now,
      updatedAt: now,
    },
  };
  await store.upsertViewer(next);
  await store.appendAudit({
    at: now,
    actor: viewer.name,
    action: viewer.newsletter ? "newsletter_update" : "newsletter_subscribe",
    detail: `Monthly email to ${email}`,
  });
  return next;
}

/**
 * Unsubscribe immediately. No-op when not subscribed. `actor` defaults to the
 * viewer themselves (self-service unsubscribe); pass the admin's name when
 * removing another viewer's subscription instead.
 */
export async function clearNewsletterPreference(
  store: Store,
  viewer: Viewer,
  actor = viewer.name,
): Promise<Viewer> {
  if (!viewer.newsletter) return viewer;
  const { newsletter: _, ...rest } = viewer;
  const next: Viewer = { ...rest };
  await store.upsertViewer(next);
  await store.appendAudit({
    at: new Date().toISOString(),
    actor,
    action: "newsletter_unsubscribe",
    detail: actor === viewer.name ? undefined : `Removed ${viewer.name}'s subscription`,
  });
  return next;
}
