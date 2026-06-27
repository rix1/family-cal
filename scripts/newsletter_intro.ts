/**
 * One-off debug CLI: read a prompt on stdin, run it through the SAME local model
 * the server uses, and print the intro on stdout. This imports the server's
 * capability (`OllamaIntroWriter`) rather than the server shelling out to it — so
 * there's one implementation. For the real monthly job see `prepare_newsletter.ts`.
 *
 *   deno run --allow-net --allow-env scripts/newsletter_intro.ts <<< "Skriv en hilsen"
 *
 * Override the target with OLLAMA_HOST / INTRO_MODEL. Must stay LOCAL (see
 * `lib/intro_writer.ts`).
 */

import { OllamaIntroWriter } from "@/lib/intro_writer.ts";

const prompt = await new Response(Deno.stdin.readable).text();
const intro = await new OllamaIntroWriter().write(prompt);
await Deno.stdout.write(new TextEncoder().encode(intro));
