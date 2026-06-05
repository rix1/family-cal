import { accessUrls, createViewer, randomToken } from "../lib/access_links.ts";
import { assert, assertEquals } from "./asserts.ts";

Deno.test("randomToken creates URL-safe high-entropy capabilities", () => {
  const first = randomToken();
  const second = randomToken();
  assert(/^[A-Za-z0-9_-]{32}$/.test(first));
  assert(first !== second);
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
    "https://family.example/edit/test-token",
  );
});
