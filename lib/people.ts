import type { Person } from "./model.ts";
import { slug } from "./dates.ts";
import type { Store } from "./store.ts";

const DATE_FULL = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MD = /^\d{2}-\d{2}$/;

export class ValidationError extends Error {}

export interface PersonInput {
  id?: string;
  name?: string;
  born?: string | null;
  died?: string | null;
  groups?: string[];
  notes?: string;
}

function normBirth(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !(DATE_FULL.test(value) || DATE_MD.test(value))) {
    throw new ValidationError(`invalid date "${String(value)}" (use YYYY-MM-DD, MM-DD, or empty)`);
  }
  return value;
}

function normDeath(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !DATE_FULL.test(value)) {
    throw new ValidationError(`invalid death date "${String(value)}" (use YYYY-MM-DD or empty)`);
  }
  return value;
}

/** Validate and normalize one input into a Person, assigning an id if missing. */
export function normalizePerson(input: PersonInput, knownGroups: Set<string>): Person {
  const name = (input.name ?? "").trim();
  if (!name) throw new ValidationError("name is required");

  const groups = Array.isArray(input.groups) ? input.groups.filter((g) => knownGroups.has(g)) : [];
  const id = input.id?.trim() || `${slug(name)}-${crypto.randomUUID().slice(0, 8)}`;

  return {
    id,
    name,
    born: normBirth(input.born),
    died: normDeath(input.died),
    groups,
    notes: (input.notes ?? "").trim(),
  };
}

/**
 * Apply a full replacement of the people list: deletes removed, upserts changed
 * or new, and records each change in the audit log. Returns the resulting list.
 */
export async function applyPeople(
  store: Store,
  inputs: PersonInput[],
  actor: string,
): Promise<Person[]> {
  if (!Array.isArray(inputs)) throw new ValidationError("expected an array of people");

  const knownGroups = new Set((await store.listGroups()).map((g) => g.key));
  const next = inputs.map((i) => normalizePerson(i, knownGroups));

  const ids = new Set<string>();
  for (const p of next) {
    if (ids.has(p.id)) throw new ValidationError(`duplicate id "${p.id}"`);
    ids.add(p.id);
  }

  const current = await store.listPeople();
  const currentById = new Map(current.map((p) => [p.id, p]));
  const at = new Date().toISOString();

  for (const p of current) {
    if (!ids.has(p.id)) {
      await store.deletePerson(p.id);
      await store.appendAudit({ at, actor, action: "delete", targetId: p.id, detail: p.name });
    }
  }

  for (const p of next) {
    const prev = currentById.get(p.id);
    if (!prev) {
      await store.upsertPerson(p);
      await store.appendAudit({ at, actor, action: "create", targetId: p.id, detail: p.name });
    } else if (JSON.stringify(prev) !== JSON.stringify(p)) {
      await store.upsertPerson(p);
      await store.appendAudit({ at, actor, action: "update", targetId: p.id, detail: p.name });
    }
  }

  return await store.listPeople();
}

/** Validate and update one existing person without replacing the full collection. */
export async function updatePerson(
  store: Store,
  id: string,
  input: PersonInput,
  actor: string,
): Promise<Person> {
  const current = await store.getPerson(id);
  if (!current) throw new ValidationError("person not found");

  const knownGroups = new Set((await store.listGroups()).map((group) => group.key));
  const next = normalizePerson({ ...input, id }, knownGroups);
  await store.upsertPerson(next);
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    await store.appendAudit({
      at: new Date().toISOString(),
      actor,
      action: "update",
      targetId: id,
      detail: next.name,
    });
  }
  return next;
}
