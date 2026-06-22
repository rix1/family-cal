import { KvStore } from "../lib/kv_store.ts";
import { assert, assertEquals } from "./asserts.ts";

async function freshStore(): Promise<KvStore> {
  // ":memory:" gives each test an isolated, ephemeral KV.
  return await KvStore.create(":memory:");
}

Deno.test("KvStore is empty on first open", async () => {
  const store = await freshStore();
  try {
    assertEquals(await store.listPeople(), []);
    assertEquals(await store.listGroups(), []);
    assertEquals(await store.listViewers(), []);
    assertEquals(await store.getViewer("missing"), null);
    assertEquals(await store.listInvites(), []);
    assertEquals(await store.getInvite("missing"), null);
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

Deno.test("KvStore setGroups replaces group configuration", async () => {
  const store = await freshStore();
  try {
    await store.setGroups([{ key: "family", label: "Family", color: "teal" }]);
    assertEquals(await store.listGroups(), [{ key: "family", label: "Family", color: "teal" }]);
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
    await store.deleteViewer("issued-token");
    assertEquals(await store.getViewer("issued-token"), null);
  } finally {
    store.close();
  }
});

Deno.test("KvStore persists newsletter drafts", async () => {
  const store = await freshStore();
  try {
    assertEquals(await store.listNewsletterDrafts(), []);
    const draft = {
      id: "draft-1",
      month: "2026-07",
      segment: "all",
      subject: "Familiekalenderen: bursdager i juli 2026",
      body: "body",
      prompt: "prompt",
      groups: [],
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z",
      status: "draft" as const,
    };
    await store.upsertNewsletterDraft(draft);
    assertEquals(await store.getNewsletterDraft("draft-1"), draft);
    assertEquals((await store.listNewsletterDrafts()).length, 1);
    await store.deleteNewsletterDraft("draft-1");
    assertEquals(await store.getNewsletterDraft("draft-1"), null);
  } finally {
    store.close();
  }
});

Deno.test("KvStore persists invite capabilities", async () => {
  const store = await freshStore();
  try {
    const invite = {
      token: "family-invite",
      createdAt: "2026-06-08T12:00:00Z",
      expiresAt: "2026-06-15T12:00:00Z",
      canEdit: true,
    };
    await store.upsertInvite(invite);
    assertEquals(await store.getInvite(invite.token), invite);
    assertEquals(await store.listInvites(), [invite]);
    await store.deleteInvite(invite.token);
    assertEquals(await store.getInvite(invite.token), null);
  } finally {
    store.close();
  }
});

Deno.test("KvStore round-trips login tokens", async () => {
  const store = await freshStore();
  try {
    const loginToken = {
      token: "magic",
      email: "kari@example.com",
      viewerToken: "kari-token",
      createdAt: "2026-06-08T12:00:00Z",
      expiresAt: "2026-06-08T12:30:00Z",
    };
    assertEquals(await store.getLoginToken("magic"), null);
    await store.upsertLoginToken(loginToken);
    assertEquals(await store.getLoginToken("magic"), loginToken);
    await store.deleteLoginToken("magic");
    assertEquals(await store.getLoginToken("magic"), null);
  } finally {
    store.close();
  }
});
