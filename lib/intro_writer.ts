/**
 * Writes the newsletter's prose by shelling out to a LOCAL model.
 *
 * The prompt (see `buildPrompt`) passes no names or dates — only the month and
 * aggregate counts — so it can't leak family specifics. Even so, keep `INTRO_CMD`
 * a LOCAL command (see `scripts/newsletter_intro.ts`); never a remote/cloud CLI.
 *
 * Mirrors the `EmailSender` seam: `getIntroWriter()` returns a command-backed
 * writer when `INTRO_CMD` is set, else `null` — and callers fall back to the
 * deterministic placeholder, so a missing or failing model never blocks a draft.
 */

export interface IntroWriter {
  /** Returns the intro text for `prompt` (piped to the command on stdin). */
  write(prompt: string): Promise<string>;
}

/** Runs a local command with the prompt on stdin and returns trimmed stdout. */
export class CommandIntroWriter implements IntroWriter {
  #exe: string;
  #args: string[];
  #timeoutMs: number;

  constructor(command: string[], timeoutMs = 120_000) {
    if (!command.length) throw new Error("INTRO_CMD is empty");
    [this.#exe, ...this.#args] = command;
    this.#timeoutMs = timeoutMs;
  }

  async write(prompt: string): Promise<string> {
    const child = new Deno.Command(this.#exe, {
      args: this.#args,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();

    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(prompt));
    await writer.close();

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // already exited
      }
    }, this.#timeoutMs);

    let output;
    try {
      output = await child.output();
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

/** Local command writer when `INTRO_CMD` is set, else null (caller uses the placeholder). */
export function getIntroWriter(): IntroWriter | null {
  const command = Deno.env.get("INTRO_CMD");
  if (!command?.trim()) return null;
  return new CommandIntroWriter(parseCommand(command));
}
