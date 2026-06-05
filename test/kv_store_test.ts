import { KvStore } from "../lib/kv_store.ts";
import { SEED_PEOPLE } from "../lib/seed.ts";
import { assert, assertEquals } from "./asserts.ts";

async function freshStore(): Promise<KvStore> {
  // ":memory:" gives each test an isolated, ephemeral KV.
  return await KvStore.create(":memory:");
}

Deno.test("KvStore seeds people, groups and viewers on first open", async () => {
  const store = await freshStore();
  try {
    assertEquals((await store.listPeople()).length, SEED_PEOPLE.length);
    assertEquals((await store.listGroups()).length, 2);
    assertEquals((await store.getViewer("demo-dk"))?.groups, ["dk"]);
    assertEquals((await store.getViewer("demo-edit"))?.canEdit, true);
    assertEquals(await store.getViewer("missing"), null);
  } finally {
    store.close();
  }
});

Deno.test("KvStore upsert/get/delete round-trips a person", async () => {
  const store = await freshStore();
  try {
    await store.upsertPerson({
      id: "test-1",
      name: "Test",
      born: "2000-01-02",
      died: null,
      groups: ["no"],
      notes: "hi",
    });
    assertEquals((await store.getPerson("test-1"))?.name, "Test");

    await store.upsertPerson({
      id: "test-1",
      name: "Test Renamed",
      born: "2000-01-02",
      died: null,
      groups: ["no"],
      notes: "hi",
    });
    assertEquals((await store.getPerson("test-1"))?.name, "Test Renamed");

    await store.deletePerson("test-1");
    assertEquals(await store.getPerson("test-1"), null);
  } finally {
    store.close();
  }
});

Deno.test("KvStore audit is most-recent-first", async () => {
  const store = await freshStore();
  try {
    await store.appendAudit({
      at: "2024-01-01T00:00:00.000Z",
      actor: "a",
      action: "create",
      targetId: "1",
    });
    await store.appendAudit({
      at: "2024-02-01T00:00:00.000Z",
      actor: "b",
      action: "update",
      targetId: "1",
    });
    const audit = await store.listAudit();
    assertEquals(audit.length, 2);
    assertEquals(audit[0].actor, "b"); // newest first
    assert(audit[0].at > audit[1].at);
  } finally {
    store.close();
  }
});

Deno.test("KvStore upsertViewer persists issued capabilities", async () => {
  const store = await freshStore();
  try {
    await store.upsertViewer({
      token: "issued-token",
      name: "Issued viewer",
      groups: ["no"],
      canEdit: false,
    });
    assertEquals(await store.getViewer("issued-token"), {
      token: "issued-token",
      name: "Issued viewer",
      groups: ["no"],
      canEdit: false,
    });
  } finally {
    store.close();
  }
});
