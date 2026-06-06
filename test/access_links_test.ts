import {
  accessUrls,
  createViewer,
  expirePreviousViewerLinks,
  randomToken,
} from "../lib/access_links.ts";
import { SeedStore } from "../lib/store.ts";
import { assert, assertEquals } from "./asserts.ts";

Deno.test("randomToken creates URL-safe high-entropy capabilities", () => {
  const first = randomToken();
  const second = randomToken();
  assert(/^[A-Za-z0-9_-]{32}$/.test(first));
  assert(first !== second);
});

Deno.test("issuing a replacement expires active links for the same viewer name", async () => {
  const oldViewer = createViewer({
    name: "Solveig",
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
    groups: ["no"],
    canEdit: false,
    token: "test-token",
  });
  assertEquals(accessUrls(readOnly, "https://family.example/"), {
    calendar: "https://family.example/view/test-token",
    editor: null,
    ical: "https://family.example/cal/test-token.ics",
  });

  assertEquals(
    accessUrls({ ...readOnly, canEdit: true }, "https://family.example").editor,
    "https://family.example/admin/?token=test-token",
  );
});
