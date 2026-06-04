import type { GroupInfo, Person } from "./model.ts";
import { SEED_GROUPS, SEED_PEOPLE } from "./seed.ts";

/**
 * Storage seam. The generator and (future) edit API depend only on this
 * interface, so the concrete engine — Deno KV, D1, Turso, Postgres, ... — stays
 * swappable. Methods are async to match a real backend from day one.
 */
export interface Store {
  listPeople(): Promise<Person[]>;
  listGroups(): Promise<GroupInfo[]>;
}

/** In-memory store backed by the seed data. */
export class SeedStore implements Store {
  #people: Person[];
  #groups: GroupInfo[];

  constructor(people: Person[] = SEED_PEOPLE, groups: GroupInfo[] = SEED_GROUPS) {
    this.#people = people;
    this.#groups = groups;
  }

  // deno-lint-ignore require-await
  async listPeople(): Promise<Person[]> {
    return this.#people;
  }

  // deno-lint-ignore require-await
  async listGroups(): Promise<GroupInfo[]> {
    return this.#groups;
  }
}
