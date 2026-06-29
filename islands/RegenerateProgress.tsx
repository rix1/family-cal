import { useState } from "preact/hooks";

type StepKey = "collected" | "written" | "saved" | "done";
type StepState = "pending" | "active" | "done";

const ORDER: StepKey[] = ["collected", "written", "saved", "done"];
const STEPS: { key: StepKey; label: string }[] = [
  { key: "collected", label: "Gathering birthday data" },
  { key: "written", label: "Writing the intro with the local model" },
  { key: "saved", label: "Saving the draft" },
  { key: "done", label: "Done" },
];

function stepState(index: number, reached: number): StepState {
  if (index <= reached) return "done";
  if (index === reached + 1) return "active";
  return "pending";
}

interface Props {
  label: string;
  class?: string;
}

/**
 * Drives the "Generate" action over fetch (instead of a full-page POST, which
 * would tear down the page) and renders a checklist that ticks off each step as
 * the server streams real NDJSON milestones — the model call is the slow one.
 * Reloads to the saved draft when done. Nielsen heuristic #1: visibility of status.
 */
export function RegenerateProgress({ label, class: cls = "btn btn-danger" }: Props) {
  const [running, setRunning] = useState(false);
  const [reached, setReached] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  async function run(form: HTMLFormElement) {
    setRunning(true);
    setError(null);
    setReached(-1);
    try {
      const data = new FormData(form);
      data.set("stream", "1");
      // NB: don't read `form.action` — the hidden <input name="action"> clobbers
      // the built-in property (HTMLFormElement is [OverrideBuiltins]), so it
      // returns the input element, not the URL. Read the attribute directly.
      const action = form.getAttribute("action") || globalThis.location.pathname;
      const res = await fetch(action, {
        method: "POST",
        body: data,
        headers: { accept: "application/x-ndjson" },
      });
      if (!res.ok || !res.body) throw new Error(`Server responded ${res.status}`);

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { step?: StepKey; done?: boolean; error?: string };
          if (event.error) throw new Error(event.error);
          if (event.step) setReached(ORDER.indexOf(event.step));
          if (event.done) setReached(ORDER.indexOf("saved"));
        }
      }
      setReached(ORDER.indexOf("done"));
      // Let the final check paint, then reload to show the new draft + toast.
      setTimeout(
        () => globalThis.location.assign(`${globalThis.location.pathname}?regenerated=1`),
        500,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRunning(false);
    }
  }

  return (
    <div class="grid gap-3">
      <button
        type="submit"
        class={cls}
        disabled={running}
        onClick={(event) => {
          const form = (event.currentTarget as HTMLButtonElement).form;
          if (!form) return; // no JS-less fallback form? let the native submit run
          event.preventDefault();
          run(form);
        }}
      >
        {running ? "Generating…" : label}
      </button>

      {running && (
        <ol class="grid gap-2 text-sm" aria-live="polite">
          {STEPS.map((step, index) => {
            const state = stepState(index, reached);
            return (
              <li
                key={step.key}
                class={`flex items-center gap-2 transition-opacity duration-300 ${
                  state === "pending" ? "opacity-40" : "opacity-100"
                }`}
              >
                <StepIcon state={state} />
                <span class={state === "done" ? "text-ink" : "text-ink-2"}>{step.label}</span>
              </li>
            );
          })}
        </ol>
      )}

      {error && <p class="text-sm text-danger">Could not generate: {error}</p>}
    </div>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span
        class="grid size-4 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-bold text-on-accent"
        aria-hidden="true"
      >
        ✓
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        class="size-4 shrink-0 animate-spin rounded-full border-2 border-ink-3 border-t-transparent"
        aria-hidden="true"
      />
    );
  }
  return <span class="size-4 shrink-0 rounded-full border-2 border-line" aria-hidden="true" />;
}
