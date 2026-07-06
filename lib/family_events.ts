import { EVENT_KINDS, type EventKind, type FamilyEvent, isPersonalGroup } from "./model.ts";
import { slug } from "./dates.ts";
import { ValidationError } from "./people.ts";
import type { Store } from "./store.ts";

const DATE_FULL = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MD = /^\d{2}-\d{2}$/;

export const eventKindLabels: Record<EventKind, string> = {
  wedding: "Wedding",
  baptism: "Baptism",
  confirmation: "Confirmation",
  other: "Other",
};

export interface FamilyEventInput {
  id?: string;
  kind?: string;
  title?: string;
  date?: string;
  groups?: string[];
  notes?: string;
}

/** Validate and normalize one input into a FamilyEvent, assigning an id if missing. */
export function normalizeEvent(input: FamilyEventInput, knownGroups: Set<string>): FamilyEvent {
  const kind = (input.kind ?? "") as EventKind;
  if (!EVENT_KINDS.includes(kind)) {
    throw new ValidationError(`unknown event kind "${String(input.kind)}"`);
  }

  const title = (input.title ?? "").trim();
  if (!title) throw new ValidationError("title is required");

  const date = (input.date ?? "").trim();
  if (!(DATE_FULL.test(date) || DATE_MD.test(date))) {
    throw new ValidationError(`invalid date "${date}" (use YYYY-MM-DD or MM-DD)`);
  }

  const groups = Array.isArray(input.groups) ? input.groups.filter(Boolean) : [];
  if (!groups.length) throw new ValidationError("at least one group is required");
  for (const group of groups) {
    if (!knownGroups.has(group)) throw new ValidationError(`unknown group "${group}"`);
  }

  const id = input.id?.trim() || `${kind}-${slug(title)}-${crypto.randomUUID().slice(0, 8)}`;

  return { id, kind, title, date, groups, notes: (input.notes ?? "").trim() };
}

/** Validate and create one event, assigning an id and auditing the editor. */
export async function addEvent(
  store: Store,
  input: FamilyEventInput,
  actor: string,
): Promise<FamilyEvent> {
  // Events are shared family milestones, so they tag branches only — personal
  // lists are people-only by design (docs/personal-groups.md, question 2).
  const knownGroups = new Set(
    (await store.listGroups()).filter((group) => !isPersonalGroup(group)).map((group) => group.key),
  );
  const event = normalizeEvent(input, knownGroups);
  await store.upsertEvent(event);
  await store.appendAudit({
    at: new Date().toISOString(),
    actor,
    action: "create_event",
    targetId: event.id,
    detail: `Added ${event.kind} "${event.title}" on ${event.date}`,
    groups: event.groups,
  });
  return event;
}
