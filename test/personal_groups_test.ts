import { closeStoreForTests, getStore } from "../lib/db.ts";
import { NEW_BRANCH_PREFIX, PERSONAL_AFFILIATION } from "../lib/groups.ts";
import { isPersonalGroup } from "../lib/model.ts";
import { calendarViewData } from "../lib/view_data.ts";
import { assert, assertEquals, assertStringIncludes } from "./asserts.ts";
import { populateTestStore, TEST_GROUPS } from "./fixtures.ts";

Deno.env.set("KV_PATH", ":memory:");

const peopleRoute = await import("../routes/api/people/[token].ts");
const eventsRoute = await import("../routes/api/events/[token].ts");
const inviteRoute = await import("../routes/invite/[token].tsx");
const profileRoute = await import("../routes/profile/index.tsx");
const adminGroupsRoute = await import("../routes/admin/groups/index.tsx");

function ctx(
  url: string,
  init: RequestInit = {},
  params: Record<string, string> = {},
) {
  const req = new Request(url, init);
  return { req, url: new URL(req.url), params } as never;
}

function routeTest(name: string, fn: () => void | Promise<void>) {
  Deno.test(name, async () => {
    try {
      await populateTestStore(await getStore());
      await fn();
    } finally {
      await closeStoreForTests();
    }
  });
}

function putPerson(token: string, person: Record<string, unknown>) {
  return peopleRoute.handler.PUT(
    ctx(
      `http://localhost/api/people/${token}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ person }),
      },
      { token },
    ),
  );
}

routeTest("first save into 'my people' creates the unlisted list and follows it", async () => {
  const store = await getStore();
  const res = await putPerson("view-dk", {
    name: "Jonas",
    born: "1990-04-01",
    affiliation: PERSONAL_AFFILIATION,
  });
  assertEquals(res.status, 200);
  const body = await res.json();

  // The response describes the created group so the client can register it.
  assert(body.group, "response should carry the new group");
  assertEquals(body.group.kind, "personal");
  assertEquals(body.person.affiliation, body.group.key);

  const group = (await store.listGroups()).find((g) => g.key === body.group.key);
  assert(group && isPersonalGroup(group));
  assertEquals(group.owner, "dk@example.com");
  assertEquals(group.listed, false);
  assertStringIncludes(group.label, "folk");

  // Creator follows their own list; the person is filed under it.
  const viewer = await store.getViewer("view-dk");
  assert(viewer!.groups.includes(group.key));

  // Second save reuses the list (no new group in the response).
  const again = await putPerson("view-dk", {
    name: "Mia",
    born: "1991-05-02",
    affiliation: group.key,
  });
  assertEquals(again.status, 200);
  assertEquals((await again.json()).group, undefined);
  assertEquals(
    (await store.listGroups()).filter(isPersonalGroup).length,
    1,
  );
});

routeTest("a typed new branch is created once and matched case-insensitively", async () => {
  const store = await getStore();
  const res = await putPerson("view-dk", {
    name: "Onkel Hans",
    born: "1955-02-03",
    affiliation: `${NEW_BRANCH_PREFIX}Mormors side`,
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.group.kind, undefined); // a branch, not a personal list
  assertEquals(body.group.key, "mormors-side");

  const branch = (await store.listGroups()).find((g) => g.key === "mormors-side");
  assert(branch && !isPersonalGroup(branch));
  assert((await store.getViewer("view-dk"))!.groups.includes("mormors-side"));

  // Same label typed again (different case) resolves to the existing branch.
  const again = await putPerson("view-dk", {
    name: "Tante Grete",
    born: "1958-06-07",
    affiliation: `${NEW_BRANCH_PREFIX}mormors SIDE`,
  });
  assertEquals((await again.json()).person.affiliation, "mormors-side");
  assertEquals(
    (await store.listGroups()).filter((g) => g.key === "mormors-side").length,
    1,
  );

  // An existing branch label offered as "new" also reuses the branch.
  const existing = TEST_GROUPS[0];
  const reuse = await putPerson("view-dk", {
    name: "Ny slektning",
    born: "1999-09-09",
    affiliation: `${NEW_BRANCH_PREFIX}${existing.label}`,
  });
  assertEquals((await reuse.json()).person.affiliation, existing.key);
});

routeTest("events cannot target personal lists", async () => {
  await (await putPerson("view-dk", {
    name: "Jonas",
    born: "1990-04-01",
    affiliation: PERSONAL_AFFILIATION,
  })).json();
  const store = await getStore();
  const list = (await store.listGroups()).find(isPersonalGroup)!;

  const res = await eventsRoute.handler.PUT(
    ctx(
      "http://localhost/api/events/view-dk",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: { kind: "other", title: "Venne-middag", date: "06-15", groups: [list.key] },
        }),
      },
      { token: "view-dk" },
    ),
  );
  assertEquals(res.status, 400);
});

routeTest("unlisted lists stay invisible: invite, others' calendars, follows", async () => {
  await (await putPerson("view-dk", {
    name: "Jonas",
    born: "1990-04-01",
    affiliation: PERSONAL_AFFILIATION,
  })).json();
  const store = await getStore();
  const list = (await store.listGroups()).find(isPersonalGroup)!;

  // Invite page doesn't offer it, signup can't sneak it in.
  await store.upsertInvite({
    token: "join",
    createdAt: "2026-06-08T10:00:00Z",
    expiresAt: "2099-06-15T10:00:00Z",
    isAdmin: false,
  });
  const invitePage = await inviteRoute.handlers.GET(
    ctx("http://localhost/invite/join", {}, { token: "join" }),
  );
  assert(!(invitePage instanceof Response));
  assert(!invitePage.data.groups.some((g: { key: string }) => g.key === list.key));

  // Another viewer's calendar payload never names the list.
  const other = await calendarViewData(store, ["no", "dk"]);
  assert(!(list.key in other.groups));
  // The owner's does.
  const own = await calendarViewData(store, (await store.getViewer("view-dk"))!.groups);
  assert(list.key in own.groups);
  assertEquals(own.groups[list.key].kind, "personal");

  // Someone else cannot follow the unlisted key from their profile.
  const form = new FormData();
  form.set("action", "groups");
  form.append("groups", list.key);
  let rejected = false;
  try {
    await profileRoute.handlers.POST(
      ctx("http://localhost/profile/", {
        method: "POST",
        headers: { cookie: "family_viewer=view-all" },
        body: form,
      }),
    );
  } catch {
    rejected = true;
  }
  assert(rejected, "following an unlisted list should be rejected");
});

routeTest("sharing a list makes it followable; unsharing hides it again", async () => {
  await (await putPerson("view-dk", {
    name: "Jonas",
    born: "1990-04-01",
    affiliation: PERSONAL_AFFILIATION,
  })).json();
  const store = await getStore();
  const list = (await store.listGroups()).find(isPersonalGroup)!;

  // Owner flips the share toggle on their profile.
  const share = new FormData();
  share.set("action", "share-list");
  const shared = await profileRoute.handlers.POST(
    ctx("http://localhost/profile/", {
      method: "POST",
      headers: { cookie: "family_viewer=view-dk" },
      body: share,
    }),
  );
  assertEquals(shared.status, 303);
  assertEquals(shared.headers.get("location"), "/profile/?saved=shared");
  assert((await store.listGroups()).find((g) => g.key === list.key)!.listed);

  // Now the partner can follow it, and their calendar names it.
  const follow = new FormData();
  follow.set("action", "groups");
  follow.append("groups", "no");
  follow.append("groups", list.key);
  const followed = await profileRoute.handlers.POST(
    ctx("http://localhost/profile/", {
      method: "POST",
      headers: { cookie: "family_viewer=view-all" },
      body: follow,
    }),
  );
  assertEquals(followed.status, 303);
  assert((await store.getViewer("view-all"))!.groups.includes(list.key));

  // Unshare puts it back to private.
  const unshare = new FormData();
  unshare.set("action", "unshare-list");
  await profileRoute.handlers.POST(
    ctx("http://localhost/profile/", {
      method: "POST",
      headers: { cookie: "family_viewer=view-dk" },
      body: unshare,
    }),
  );
  assertEquals(
    (await store.listGroups()).find((g) => g.key === list.key)!.listed,
    false,
  );
});

routeTest("admin group save keeps personal lists despite full replacement", async () => {
  await (await putPerson("view-dk", {
    name: "Jonas",
    born: "1990-04-01",
    affiliation: PERSONAL_AFFILIATION,
  })).json();
  const store = await getStore();
  const before = (await store.listGroups()).filter(isPersonalGroup);
  assertEquals(before.length, 1);

  const form = new FormData();
  TEST_GROUPS.forEach((group, index) => {
    form.append("key", group.key);
    form.append("label", group.label);
    form.append(`color-${index}`, group.color);
  });
  const res = await adminGroupsRoute.handlers.POST(
    ctx("http://localhost/admin/groups/", {
      method: "POST",
      headers: { cookie: "family_admin=admin" },
      body: form,
    }),
  );
  assertEquals(res.status, 303);

  const after = await store.listGroups();
  assertEquals(after.filter(isPersonalGroup).length, 1);
  assertEquals(after.filter((g) => !isPersonalGroup(g)).length, TEST_GROUPS.length);
});
