import {
  accessUrls,
  createViewer,
  ensureFeedToken,
  expirePreviousViewerLinks,
  randomToken,
  setViewerGroups,
  viewerByFeedToken,
} from "../lib/access_links.ts";
import type { GroupInfo, Viewer } from "../lib/model.ts";
import { SeedStore } from "../lib/store.ts";
import { assert, assertEquals, assertRejects } from "./asserts.ts";

const GROUPS: GroupInfo[] = [
  { key: "no", label: "Family", color: "blue" },
  { key: "dk", label: "Danish family", color: "rose" },
];

Deno.test("setViewerGroups normalizes, validates and audits the follow-list", async () => {
  const viewer = createViewer({
    name: "Solveig",
    email: "solveig@example.com",
    groups: ["no"],
    canEdit: false,
    token: "solveig",
  });
  const store = new SeedStore([], GROUPS, [viewer]);

  const updated = await setViewerGroups(store, viewer, [" dk ", "no", "dk", ""]);
  assertEquals(updated.groups, ["dk", "no"]); // deduped, trimmed, sorted
  assertEquals((await store.getViewer("solveig"))?.groups, ["dk", "no"]);
  assert((await store.listAudit()).some((entry) => entry.action === "viewer_groups"));

  // Empty is allowed (follow nothing); unknown groups are rejected.
  assertEquals((await setViewerGroups(store, viewer, [])).groups, []);
  await assertRejects(() => setViewerGroups(store, viewer, ["bogus"]));
});

Deno.test("randomToken creates URL-safe high-entropy capabilities", () => {
  const first = randomToken();
  const second = randomToken();
  assert(/^[A-Za-z0-9_-]{32}$/.test(first));
  assert(first !== second);
});

Deno.test("issuing a replacement expires active links for the same viewer name", async () => {
  const oldViewer = createViewer({
    name: "Solveig",
    email: "solveig@example.com",
    groups: ["no"],
    canEdit: false,
    token: "old-token",
  });
  const alreadyExpired = { ...oldViewer, token: "older-token", expiredAt: "2025-01-01T00:00:00Z" };
  const otherViewer = { ...oldViewer, token: "other-token", name: "Åse" };
  const replacement = { ...oldViewer, token: "new-token", name: " solveig " };
  const store = new SeedStore([], [], [oldViewer, alreadyExpired, otherViewer]);

  const expired = await expirePreviousViewerLinks(
    store,
    replacement,
    "2026-06-06T12:00:00Z",
  );

  assertEquals(expired.map((viewer) => viewer.token), ["old-token"]);
  assertEquals((await store.getViewer("old-token"))?.expiredAt, "2026-06-06T12:00:00Z");
  assertEquals((await store.getViewer("older-token"))?.expiredAt, "2025-01-01T00:00:00Z");
  assertEquals((await store.getViewer("other-token"))?.expiredAt, undefined);
});

Deno.test("accessUrls returns viewer URLs and editor URL only for editors", () => {
  const readOnly = createViewer({
    name: "Solveig",
    email: "solveig@example.com",
    groups: ["no"],
    canEdit: false,
    token: "test-token",
  });
  assertEquals(accessUrls(readOnly, "https://family.example/"), {
    calendar: "https://family.example/view/test-token",
    editor: null,
    // iCal uses the stable feed token, not the rotating session token.
    ical: `https://family.example/cal/${readOnly.feedToken}.ics`,
  });

  assertEquals(
    accessUrls({ ...readOnly, canEdit: true }, "https://family.example").editor,
    "https://family.example/admin/?token=test-token",
  );
});

Deno.test("createViewer assigns a distinct, stable feed token", () => {
  const a = createViewer({
    name: "A",
    email: "a@example.com",
    groups: [],
    canEdit: false,
    token: "a",
  });
  const b = createViewer({
    name: "B",
    email: "b@example.com",
    groups: [],
    canEdit: false,
    token: "b",
  });
  assert(a.feedToken && /^[A-Za-z0-9_-]{32}$/.test(a.feedToken));
  assert(a.feedToken !== a.token);
  assert(a.feedToken !== b.feedToken);
});

Deno.test("ensureFeedToken backfills a legacy viewer once, then is stable", async () => {
  const legacy: Viewer = {
    token: "legacy",
    name: "Old",
    email: "old@example.com",
    groups: [],
    canEdit: false,
  };
  const store = new SeedStore([], [], [legacy]);

  const first = await ensureFeedToken(store, legacy);
  assert(/^[A-Za-z0-9_-]{32}$/.test(first));
  const stored = await store.getViewer("legacy");
  assertEquals(stored?.feedToken, first);

  // A viewer that already has one is returned untouched.
  assertEquals(await ensureFeedToken(store, stored!), first);
});

Deno.test("viewerByFeedToken resolves only the active owner", async () => {
  const active = createViewer({
    name: "A",
    email: "a@example.com",
    groups: [],
    canEdit: false,
    token: "a",
  });
  const expired: Viewer = {
    ...createViewer({ name: "B", email: "b@example.com", groups: [], canEdit: false, token: "b" }),
    expiredAt: "2025-01-01T00:00:00Z",
  };
  const store = new SeedStore([], [], [active, expired]);

  assertEquals((await viewerByFeedToken(store, active.feedToken!))?.token, "a");
  assertEquals(await viewerByFeedToken(store, expired.feedToken!), null);
  assertEquals(await viewerByFeedToken(store, "nope"), null);
});

Deno.test("re-issuing a link carries the feed token forward", async () => {
  const old = createViewer({
    name: "Solveig",
    email: "solveig@example.com",
    groups: ["no"],
    canEdit: false,
    token: "old",
  });
  const store = new SeedStore([], [], [old]);
  const replacement = createViewer({
    name: "Solveig",
    email: "solveig@example.com",
    groups: ["no"],
    canEdit: false,
    token: "new",
  });

  await expirePreviousViewerLinks(store, replacement);

  // Same feed token => an existing calendar subscription keeps working.
  assertEquals(replacement.feedToken, old.feedToken);
});
