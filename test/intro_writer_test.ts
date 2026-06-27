import {
  CommandIntroWriter,
  getIntroWriter,
  OllamaIntroWriter,
  parseCommand,
  stripReasoning,
} from "../lib/intro_writer.ts";
import { assert, assertEquals, assertRejects } from "./asserts.ts";

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

Deno.test("stripReasoning keeps only the prose after the reasoning", () => {
  assertEquals(
    stripReasoning("<think> Brukeren ber meg…\nflere linjer</think> Velkommen til nyhetsbrevet!"),
    "Velkommen til nyhetsbrevet!",
  );
  // No think tags → returned untouched (trimmed).
  assertEquals(stripReasoning("  Velkommen!  "), "Velkommen!");
  // Opened but never closed (truncated mid-thought) → empty, so caller falls back.
  assertEquals(stripReasoning("<think> reasoner i det uendelige…"), "");
  // Defensive: only the final </think> matters.
  assertEquals(stripReasoning("<think>a</think>b</think> Svar"), "Svar");
});

Deno.test("getIntroWriter defaults to the built-in Ollama writer, with overrides", () => {
  const prevCmd = Deno.env.get("INTRO_CMD");
  const prevOff = Deno.env.get("INTRO_DISABLED");
  Deno.env.delete("INTRO_CMD");
  Deno.env.delete("INTRO_DISABLED");
  try {
    assert(getIntroWriter() instanceof OllamaIntroWriter, "default is the built-in model");

    Deno.env.set("INTRO_CMD", "ollama run llama3.1");
    assert(getIntroWriter() instanceof CommandIntroWriter, "INTRO_CMD overrides with a command");

    Deno.env.delete("INTRO_CMD");
    Deno.env.set("INTRO_DISABLED", "1");
    assertEquals(getIntroWriter(), null, "INTRO_DISABLED turns prose off");
  } finally {
    Deno.env.delete("INTRO_CMD");
    Deno.env.delete("INTRO_DISABLED");
    if (prevCmd !== undefined) Deno.env.set("INTRO_CMD", prevCmd);
    if (prevOff !== undefined) Deno.env.set("INTRO_DISABLED", prevOff);
  }
});

Deno.test("OllamaIntroWriter posts to /api/generate and strips the reasoning", async () => {
  const original = globalThis.fetch;
  let captured: { url: string; body: { model: string; prompt: string } } | undefined;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), body: JSON.parse(String(init?.body)) };
    return Promise.resolve(
      new Response(JSON.stringify({ response: "<think>resonnement</think> Hei, familie!" }), {
        status: 200,
      }),
    );
  }) as typeof fetch;
  try {
    const out = await new OllamaIntroWriter({ host: "http://localhost:11434", model: "test-model" })
      .write("min prompt");
    assertEquals(out, "Hei, familie!");
    assertEquals(captured?.url, "http://localhost:11434/api/generate");
    assertEquals(captured?.body.model, "test-model");
    assertEquals(captured?.body.prompt, "min prompt");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("OllamaIntroWriter throws on a non-200 so the draft falls back", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("boom", { status: 500 }))) as typeof fetch;
  try {
    await assertRejects(() => new OllamaIntroWriter().write("x"));
  } finally {
    globalThis.fetch = original;
  }
});
