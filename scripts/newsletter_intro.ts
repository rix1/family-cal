/**
 * `INTRO_CMD` for the newsletter: drafts the intro with a LOCAL model.
 *
 * Reads the prompt on stdin, generates with NorMistral-thinking via Ollama's
 * HTTP API (the model stays warm — fits the `CommandIntroWriter` timeout), strips
 * the model's `<think>…</think>` reasoning, and writes only the prose to stdout.
 *
 * Why the HTTP API and not `ollama run`: the CLI emits ANSI cursor codes even when
 * piped, which would corrupt the intro. See `scripts/model/README.md` for how the
 * `normistral-clean` model is built (the upstream GGUF ships broken).
 *
 * Wire it up:
 *   INTRO_CMD="deno run --allow-net=127.0.0.1:11434 --allow-env=OLLAMA_HOST,INTRO_MODEL scripts/newsletter_intro.ts"
 * Overridable: OLLAMA_HOST (default http://127.0.0.1:11434), INTRO_MODEL (default normistral-clean).
 */

import { stripReasoning } from "@/lib/intro_writer.ts";

const host = Deno.env.get("OLLAMA_HOST") ?? "http://127.0.0.1:11434";
const model = Deno.env.get("INTRO_MODEL") ?? "normistral-clean";

const prompt = await new Response(Deno.stdin.readable).text();

const res = await fetch(`${host}/api/generate`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model,
    prompt,
    stream: false,
    // Low temperature for tighter instruction-following (a creative model otherwise
    // invents names/facts); generous cap + the model's `</s>` stop give room to finish
    // reasoning AND the answer, so we never truncate mid-thought (which yields no intro).
    options: { temperature: 0.2, num_predict: 2048 },
  }),
});

if (!res.ok) {
  console.error(`newsletter_intro: ollama ${res.status} ${await res.text()}`);
  Deno.exit(1);
}

const { response } = await res.json() as { response?: string };
await Deno.stdout.write(new TextEncoder().encode(stripReasoning(response ?? "")));
