import type { AuditEntry, FamilyEvent, GroupInfo, Invite, Person, Viewer } from "./model.ts";
import type { Store } from "./store.ts";

const PEOPLE = "people";
const GROUPS = "groups";
const VIEWERS = "viewers";
const INVITES = "invites";
const EVENTS = "events";
const AUDIT = "audit";

/** Store backed by Deno KV. Same contract as SeedStore; the deploy target. */
export class KvStore implements Store {
  #kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this.#kv = kv;
  }

  /** Open KV (default DB or an explicit path / ":memory:"). */
  static async create(path?: string): Promise<KvStore> {
    const kv = await Deno.openKv(path);
    return new KvStore(kv);
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
    return res.value ?? [];
  }

  async setGroups(groups: GroupInfo[]): Promise<void> {
    await this.#kv.set([GROUPS], groups);
  }

  async listEvents(): Promise<FamilyEvent[]> {
    const out: FamilyEvent[] = [];
    for await (const entry of this.#kv.list<FamilyEvent>({ prefix: [EVENTS] })) {
      out.push(entry.value);
    }
    return out;
  }

  async getEvent(id: string): Promise<FamilyEvent | null> {
    const res = await this.#kv.get<FamilyEvent>([EVENTS, id]);
    return res.value ?? null;
  }

  async upsertEvent(event: FamilyEvent): Promise<FamilyEvent> {
    await this.#kv.set([EVENTS, event.id], event);
    return event;
  }

  async deleteEvent(id: string): Promise<void> {
    await this.#kv.delete([EVENTS, id]);
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

  async deleteViewer(token: string): Promise<void> {
    await this.#kv.delete([VIEWERS, token]);
  }

  async getInvite(token: string): Promise<Invite | null> {
    const res = await this.#kv.get<Invite>([INVITES, token]);
    return res.value ?? null;
  }

  async listInvites(): Promise<Invite[]> {
    const out: Invite[] = [];
    for await (const entry of this.#kv.list<Invite>({ prefix: [INVITES] })) {
      out.push(entry.value);
    }
    return out;
  }

  async upsertInvite(invite: Invite): Promise<Invite> {
    await this.#kv.set([INVITES, invite.token], invite);
    return invite;
  }

  async deleteInvite(token: string): Promise<void> {
    await this.#kv.delete([INVITES, token]);
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
