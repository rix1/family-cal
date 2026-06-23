import { CommandIntroWriter, getIntroWriter, parseCommand } from "../lib/intro_writer.ts";
import { assertEquals, assertRejects } from "./asserts.ts";

Deno.test("parseCommand splits on whitespace", () => {
  assertEquals(parseCommand("ollama run llama3.1"), ["ollama", "run", "llama3.1"]);
  assertEquals(parseCommand("  cat  "), ["cat"]);
  assertEquals(parseCommand(""), []);
});

Deno.test("CommandIntroWriter pipes the prompt on stdin and returns stdout", async () => {
  // `cat` echoes stdin → a faithful stand-in for a local model.
  const writer = new CommandIntroWriter(["cat"]);
  assertEquals(await writer.write("Hei verden"), "Hei verden");
});

Deno.test("CommandIntroWriter throws when the command exits non-zero", async () => {
  const writer = new CommandIntroWriter(["false"]);
  await assertRejects(() => writer.write("x"));
});

Deno.test("getIntroWriter is null without INTRO_CMD", () => {
  const previous = Deno.env.get("INTRO_CMD");
  Deno.env.delete("INTRO_CMD");
  try {
    assertEquals(getIntroWriter(), null);
  } finally {
    if (previous !== undefined) Deno.env.set("INTRO_CMD", previous);
  }
});
