/**
 * Writes the newsletter's prose with a LOCAL model.
 *
 * The default writer (`OllamaIntroWriter`) calls Ollama over HTTP in-process — the
 * server owns this capability, and one-off scripts import it (see
 * `scripts/newsletter_intro.ts`), rather than the server shelling out to a script.
 * `INTRO_CMD` remains an optional escape hatch to run a different local command.
 *
 * The prompt (see `buildPrompt`) passes no names or dates, so it can't leak family
 * specifics — but inference must stay LOCAL regardless. A missing or failing model
 * never blocks a draft: callers fall back to the deterministic placeholder.
 */

/**
 * Live events emitted while a writer works, so callers can surface the raw model
 * exchange (request + streamed tokens) in a UI. Best-effort and unpersisted —
 * never required for correctness.
 */
export type WriteEvent =
  | { type: "request"; endpoint: string; body: unknown }
  | { type: "token"; text: string };

export interface IntroWriter {
  /**
   * Returns the intro text for `prompt`. `onEvent`, if given, fires with the
   * outgoing request and each streamed chunk (raw, incl. chain-of-thought) so a
   * caller can show live progress.
   */
  write(prompt: string, onEvent?: (event: WriteEvent) => void): Promise<string>;
}

const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";
const DEFAULT_INTRO_MODEL = "normistral-clean";

/**
 * Calls the local Ollama model directly over HTTP (`/api/generate`) and strips its
 * chain-of-thought. In-process — no subprocess — so the server and any importing
 * script share one implementation. Host/model come from `OLLAMA_HOST` / `INTRO_MODEL`.
 */
export class OllamaIntroWriter implements IntroWriter {
  #endpoint: string;
  #model: string;
  #timeoutMs: number;
  #keepAlive: string;

  constructor(
    opts: { host?: string; model?: string; timeoutMs?: number; keepAlive?: string } = {},
  ) {
    const host = opts.host ?? Deno.env.get("OLLAMA_HOST") ?? DEFAULT_OLLAMA_HOST;
    this.#endpoint = `${host.replace(/\/+$/, "")}/api/generate`;
    this.#model = opts.model ?? Deno.env.get("INTRO_MODEL") ?? DEFAULT_INTRO_MODEL;
    this.#timeoutMs = opts.timeoutMs ?? 120_000;
    // How long Ollama keeps the ~8GB model resident after responding. The
    // newsletter is a rare, admin-triggered job, so we default to "0" (unload
    // immediately) rather than Ollama's 5-minute default that leaves it hogging
    // RAM. Set OLLAMA_KEEP_ALIVE (e.g. "5m", "-1" to keep forever) to override.
    this.#keepAlive = opts.keepAlive ?? Deno.env.get("OLLAMA_KEEP_ALIVE") ?? "0";
  }

  async write(prompt: string, onEvent?: (event: WriteEvent) => void): Promise<string> {
    const body = {
      model: this.#model,
      prompt,
      // Stream so we can forward tokens live; the full text is still assembled
      // here before stripping chain-of-thought.
      stream: true,
      // Unload the model right after responding (see #keepAlive) so it doesn't
      // sit in memory between monthly runs.
      keep_alive: this.#keepAlive,
      // Low temperature for instruction-following (a creative model otherwise
      // invents names/facts); generous cap + the model's `</s>` stop give room to
      // finish reasoning AND the answer, so we never truncate mid-thought.
      options: { temperature: 0.2, num_predict: 2048 },
    };
    onEvent?.({ type: "request", endpoint: this.#endpoint, body });
    const res = await fetch(this.#endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    if (!res.body) throw new Error("Ollama returned no response body");

    // Ollama streams NDJSON: one `{ response, done }` object per line.
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let full = "";
    const consume = (line: string) => {
      if (!line.trim()) return;
      const chunk = JSON.parse(line) as { response?: string; error?: string };
      if (chunk.error) throw new Error(`Ollama: ${chunk.error}`);
      if (chunk.response) {
        full += chunk.response;
        onEvent?.({ type: "token", text: chunk.response });
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep the trailing partial line for the next read
      for (const line of lines) consume(line);
    }
    consume(buffer); // flush a final line with no trailing newline
    return stripReasoning(full);
  }
}

/**
 * Escape hatch: runs an arbitrary local command with the prompt on stdin and
 * returns trimmed stdout. Used only when `INTRO_CMD` is set, to swap in a different
 * model/CLI without code changes; the built-in `OllamaIntroWriter` is the default.
 */
export class CommandIntroWriter implements IntroWriter {
  #exe: string;
  #args: string[];
  #timeoutMs: number;

  constructor(command: string[], timeoutMs = 120_000) {
    if (!command.length) throw new Error("INTRO_CMD is empty");
    [this.#exe, ...this.#args] = command;
    this.#timeoutMs = timeoutMs;
  }

  async write(prompt: string, onEvent?: (event: WriteEvent) => void): Promise<string> {
    onEvent?.({ type: "request", endpoint: [this.#exe, ...this.#args].join(" "), body: prompt });
    const child = new Deno.Command(this.#exe, {
      args: this.#args,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();

    // Start consuming stdout/stderr before touching stdin: if the process dies
    // without reading its input (broken pipe), output() still closes the pipes
    // and reports the exit code — the stdin error alone says nothing useful.
    const pendingOutput = child.output();
    try {
      const writer = child.stdin.getWriter();
      await writer.write(new TextEncoder().encode(prompt));
      await writer.close();
    } catch {
      // The exit-code check below surfaces the failure.
    }

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // already exited
      }
    }, this.#timeoutMs);

    let output;
    try {
      output = await pendingOutput;
    } finally {
      clearTimeout(timer);
    }
    if (!output.success) {
      const stderr = new TextDecoder().decode(output.stderr).trim();
      throw new Error(`INTRO_CMD failed (code ${output.code}): ${stderr}`);
    }
    return new TextDecoder().decode(output.stdout).trim();
  }
}

/** Splits `INTRO_CMD` on whitespace. The prompt is passed on stdin, never as an arg. */
export function parseCommand(command: string): string[] {
  return command.trim().split(/\s+/).filter(Boolean);
}

/**
 * Strips a thinking model's `<think>…</think>` chain-of-thought, returning only
 * the final prose. NorMistral-thinking (our local intro model) always reasons
 * before answering; see `scripts/model/README.md`.
 *
 * Returns `""` when reasoning was opened but never closed — i.e. generation was
 * truncated mid-thought — so callers fall back to the placeholder rather than
 * publish raw chain-of-thought. Text with no think tags is returned untouched.
 */
export function stripReasoning(text: string): string {
  const close = text.lastIndexOf("</think>");
  if (close !== -1) return text.slice(close + "</think>".length).trim();
  if (text.includes("<think>")) return ""; // opened but not closed → incomplete
  return text.trim();
}

/**
 * The newsletter's prose writer. Defaults to the built-in local model
 * (`OllamaIntroWriter`) — no configuration needed. `INTRO_CMD` overrides it with a
 * custom local command; `INTRO_DISABLED=1` turns prose off entirely, so drafts use
 * the deterministic placeholder.
 */
export function getIntroWriter(): IntroWriter | null {
  if (Deno.env.get("INTRO_DISABLED") === "1") return null;
  const command = Deno.env.get("INTRO_CMD");
  if (command?.trim()) return new CommandIntroWriter(parseCommand(command));
  return new OllamaIntroWriter();
}
