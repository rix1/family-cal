import type { AuditEntry, GroupInfo, Person, Viewer } from "./model.ts";
import { SEED_GROUPS, SEED_PEOPLE, SEED_VIEWERS } from "./seed.ts";
import type { Store } from "./store.ts";

const PEOPLE = "people";
const GROUPS = "groups";
const VIEWERS = "viewers";
const AUDIT = "audit";

/** Store backed by Deno KV. Same contract as SeedStore; the deploy target. */
export class KvStore implements Store {
  #kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this.#kv = kv;
  }

  /** Open KV (default DB or an explicit path / ":memory:") and seed if empty. */
  static async create(path?: string): Promise<KvStore> {
    const kv = await Deno.openKv(path);
    const store = new KvStore(kv);
    await store.seedIfEmpty();
    return store;
  }

  async seedIfEmpty(): Promise<void> {
    const existing = await this.#kv
      .list({ prefix: [PEOPLE] }, { limit: 1 })
      .next();
    if (existing.done) {
      const tx = this.#kv.atomic();
      for (const person of SEED_PEOPLE) tx.set([PEOPLE, person.id], person);
      for (const viewer of SEED_VIEWERS) tx.set([VIEWERS, viewer.token], viewer);
      tx.set([GROUPS], SEED_GROUPS);
      await tx.commit();
      return;
    }

    // Add new seeded capabilities and fill fields introduced after an existing
    // local KV database was created, without replacing customized records.
    for (const viewer of SEED_VIEWERS) {
      const current = await this.#kv.get<Viewer>([VIEWERS, viewer.token]);
      if (!current.value) {
        await this.#kv.set([VIEWERS, viewer.token], viewer);
      } else if (typeof current.value.canEdit !== "boolean") {
        await this.#kv.set([VIEWERS, viewer.token], {
          ...current.value,
          canEdit: viewer.canEdit,
        });
      }
    }
  }

  async listPeople(): Promise<Person[]> {
    const out: Person[] = [];
    for await (const entry of this.#kv.list<Person>({ prefix: [PEOPLE] })) {
      out.push(entry.value);
    }
    return out;
  }

  async getPerson(id: string): Promise<Person | null> {
    const res = await this.#kv.get<Person>([PEOPLE, id]);
    return res.value ?? null;
  }

  async upsertPerson(person: Person): Promise<Person> {
    await this.#kv.set([PEOPLE, person.id], person);
    return person;
  }

  async deletePerson(id: string): Promise<void> {
    await this.#kv.delete([PEOPLE, id]);
  }

  async listGroups(): Promise<GroupInfo[]> {
    const res = await this.#kv.get<GroupInfo[]>([GROUPS]);
    return res.value ?? SEED_GROUPS;
  }

  async getViewer(token: string): Promise<Viewer | null> {
    const res = await this.#kv.get<Viewer>([VIEWERS, token]);
    return res.value ?? null;
  }

  async listViewers(): Promise<Viewer[]> {
    const out: Viewer[] = [];
    for await (const entry of this.#kv.list<Viewer>({ prefix: [VIEWERS] })) {
      out.push(entry.value);
    }
    return out;
  }

  async upsertViewer(viewer: Viewer): Promise<Viewer> {
    await this.#kv.set([VIEWERS, viewer.token], viewer);
    return viewer;
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    // Time-ordered key so list({ reverse }) yields most-recent-first.
    await this.#kv.set([AUDIT, entry.at, crypto.randomUUID()], entry);
  }

  async listAudit(limit = 100): Promise<AuditEntry[]> {
    const out: AuditEntry[] = [];
    for await (
      const entry of this.#kv.list<AuditEntry>(
        { prefix: [AUDIT] },
        { reverse: true, limit },
      )
    ) {
      out.push(entry.value);
    }
    return out;
  }

  close(): void {
    this.#kv.close();
  }
}
