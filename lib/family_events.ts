import { EVENT_KINDS, type EventKind, type FamilyEvent, type Person } from "./model.ts";
import { slug } from "./dates.ts";
import { ValidationError } from "./people.ts";

const DATE_FULL = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MD = /^\d{2}-\d{2}$/;

export const eventKindLabels: Record<EventKind, string> = {
  wedding: "Wedding",
  baptism: "Baptism",
  confirmation: "Confirmation",
  other: "Event",
};

export interface FamilyEventInput {
  id?: string;
  kind?: string;
  title?: string;
  date?: string;
  subjects?: string[];
  notes?: string;
}

/** Validate and normalize one input into a FamilyEvent, assigning an id if missing. */
export function normalizeEvent(input: FamilyEventInput, knownPeople: Set<string>): FamilyEvent {
  const kind = (input.kind ?? "") as EventKind;
  if (!EVENT_KINDS.includes(kind)) {
    throw new ValidationError(`unknown event kind "${String(input.kind)}"`);
  }

  const date = (input.date ?? "").trim();
  if (!(DATE_FULL.test(date) || DATE_MD.test(date))) {
    throw new ValidationError(`invalid date "${date}" (use YYYY-MM-DD or MM-DD)`);
  }

  const subjects = Array.isArray(input.subjects) ? input.subjects.filter(Boolean) : [];
  if (!subjects.length) throw new ValidationError("at least one person is required");
  for (const id of subjects) {
    if (!knownPeople.has(id)) throw new ValidationError(`unknown person "${id}"`);
  }

  const title = (input.title ?? "").trim();
  const id = input.id?.trim() ||
    `${kind}-${slug(subjects[0])}-${crypto.randomUUID().slice(0, 8)}`;

  return { id, kind, title, date, subjects, notes: (input.notes ?? "").trim() };
}

/** Display title: the custom one, or the subjects' names joined with "&". */
export function eventTitle(event: FamilyEvent, people: Person[]): string {
  if (event.title) return event.title;
  const byId = new Map(people.map((person) => [person.id, person.name]));
  return event.subjects.map((id) => byId.get(id) ?? id).join(" & ");
}
