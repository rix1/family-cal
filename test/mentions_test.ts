import { activeMention, insertMention } from "../lib/mentions.ts";
import { assertEquals } from "./asserts.ts";

Deno.test("activeMention finds a handle being typed at the cursor", () => {
  assertEquals(activeMention("Son of @te", 10), { query: "te", start: 7, end: 10 });
  assertEquals(activeMention("@aase", 5), { query: "aase", start: 0, end: 5 });
  assertEquals(activeMention("email@example.com", 17), null);
});

Deno.test("insertMention replaces the active query and preserves remaining text", () => {
  assertEquals(
    insertMention("Son of @te today", { query: "te", start: 7, end: 10 }, "viggo"),
    { text: "Son of @viggo today", cursor: 14 },
  );
});
