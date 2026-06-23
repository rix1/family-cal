/**
 * Writes the newsletter's intro prose by shelling out to a LOCAL model.
 *
 * The prompt (see `buildPrompt`) includes family names and ages — it is only
 * safe because inference runs on this machine. `INTRO_CMD` MUST be a local
 * command (e.g. `ollama run llama3.1`); never point it at a remote/cloud CLI.
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

/** Local command writer when `INTRO_CMD` is set, else null (caller uses the placeholder). */
export function getIntroWriter(): IntroWriter | null {
  const command = Deno.env.get("INTRO_CMD");
  if (!command?.trim()) return null;
  return new CommandIntroWriter(parseCommand(command));
}
