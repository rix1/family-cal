import type { AuditEntry, GroupInfo, Person, Viewer } from "./model.ts";

/**
 * Storage seam. The generator, feed and edit API depend only on this interface,
 * so the concrete engine — Deno KV, D1, Turso, Postgres, ... — stays swappable.
 * Methods are async to match a real backend from day one.
 */
export interface Store {
  listPeople(): Promise<Person[]>;
  getPerson(id: string): Promise<Person | null>;
  upsertPerson(person: Person): Promise<Person>;
  deletePerson(id: string): Promise<void>;

  listGroups(): Promise<GroupInfo[]>;
  setGroups(groups: GroupInfo[]): Promise<void>;

  getViewer(token: string): Promise<Viewer | null>;
  listViewers(): Promise<Viewer[]>;
  upsertViewer(viewer: Viewer): Promise<Viewer>;
  deleteViewer(token: string): Promise<void>;

  appendAudit(entry: AuditEntry): Promise<void>;
  /** Most-recent-first. */
  listAudit(limit?: number): Promise<AuditEntry[]>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Mutable in-memory store used by domain tests. Empty unless fixtures are provided. */
export class SeedStore implements Store {
  #people: Map<string, Person>;
  #groups: GroupInfo[];
  #viewers: Map<string, Viewer>;
  #audit: AuditEntry[] = [];

  constructor(
    people: Person[] = [],
    groups: GroupInfo[] = [],
    viewers: Viewer[] = [],
  ) {
    this.#people = new Map(clone(people).map((p) => [p.id, p]));
    this.#groups = clone(groups);
    this.#viewers = new Map(clone(viewers).map((v) => [v.token, v]));
  }

  // deno-lint-ignore require-await
  async listPeople(): Promise<Person[]> {
    return clone([...this.#people.values()]);
  }

  // deno-lint-ignore require-await
  async getPerson(id: string): Promise<Person | null> {
    const p = this.#people.get(id);
    return p ? clone(p) : null;
  }

  // deno-lint-ignore require-await
  async upsertPerson(person: Person): Promise<Person> {
    this.#people.set(person.id, clone(person));
    return clone(person);
  }

  // deno-lint-ignore require-await
  async deletePerson(id: string): Promise<void> {
    this.#people.delete(id);
  }

  // deno-lint-ignore require-await
  async listGroups(): Promise<GroupInfo[]> {
    return clone(this.#groups);
  }

  // deno-lint-ignore require-await
  async setGroups(groups: GroupInfo[]): Promise<void> {
    this.#groups = clone(groups);
  }

  // deno-lint-ignore require-await
  async getViewer(token: string): Promise<Viewer | null> {
    const v = this.#viewers.get(token);
    return v ? clone(v) : null;
  }

  // deno-lint-ignore require-await
  async listViewers(): Promise<Viewer[]> {
    return clone([...this.#viewers.values()]);
  }

  // deno-lint-ignore require-await
  async upsertViewer(viewer: Viewer): Promise<Viewer> {
    this.#viewers.set(viewer.token, clone(viewer));
    return clone(viewer);
  }

  // deno-lint-ignore require-await
  async deleteViewer(token: string): Promise<void> {
    this.#viewers.delete(token);
  }

  // deno-lint-ignore require-await
  async appendAudit(entry: AuditEntry): Promise<void> {
    this.#audit.push(clone(entry));
  }

  // deno-lint-ignore require-await
  async listAudit(limit = 100): Promise<AuditEntry[]> {
    return clone(this.#audit.slice(-limit).reverse());
  }
}
