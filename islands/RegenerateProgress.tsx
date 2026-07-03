import { useEffect, useRef, useState } from "preact/hooks";

type StepKey = "collected" | "written" | "titled" | "saved" | "done";
type StepState = "pending" | "active" | "done";

const ORDER: StepKey[] = ["collected", "written", "titled", "saved", "done"];
const STEPS: { key: StepKey; label: string }[] = [
  { key: "collected", label: "Gathering birthday data" },
  { key: "written", label: "Writing the intro with the local model" },
  { key: "titled", label: "Suggesting a title" },
  { key: "saved", label: "Saving the draft" },
  { key: "done", label: "Done" },
];

type RequestInfo = { endpoint: string; body: unknown };
type StreamEvent = {
  step?: StepKey;
  done?: boolean;
  error?: string;
  request?: RequestInfo;
  token?: string;
};

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
 * The model's raw request and streamed tokens are forwarded too, surfaced behind
 * a "show progress" drawer so you can follow the local model think out loud.
 * Reloads to the saved draft when done. Nielsen heuristic #1: visibility of status.
 */
export function RegenerateProgress({ label, class: cls = "btn btn-danger" }: Props) {
  const [running, setRunning] = useState(false);
  const [reached, setReached] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<RequestInfo | null>(null);
  const [log, setLog] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function run(form: HTMLFormElement) {
    setRunning(true);
    setError(null);
    setReached(-1);
    setRequest(null);
    setLog("");
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
          const event = JSON.parse(line) as StreamEvent;
          if (event.error) throw new Error(event.error);
          if (event.request) setRequest(event.request);
          if (event.token) setLog((prev) => prev + event.token);
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

  const hasLog = request !== null || log.length > 0;

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
                {step.key === "written" && hasLog && (
                  <button
                    type="button"
                    class="text-xs font-medium text-accent-2 underline underline-offset-2 hover:text-accent"
                    onClick={() => setDrawerOpen(true)}
                  >
                    show progress
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {error && <p class="text-sm text-danger">Could not generate: {error}</p>}

      {drawerOpen && (
        <ModelLogDrawer
          request={request}
          log={log}
          done={reached >= ORDER.indexOf("saved")}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

function ModelLogDrawer(
  { request, log, done, onClose }: {
    request: RequestInfo | null;
    log: string;
    done: boolean;
    onClose: () => void;
  },
) {
  const logRef = useRef<HTMLPreElement>(null);

  // The model reasons inside <think>…</think> (the opening tag lives in the
  // prompt template, so the stream starts mid-thought and the first token we see
  // is the reasoning — or `</think>` itself when it answers directly). Split on
  // the close tag: everything before is the thinking trace, everything after is
  // the final answer. Until `</think>` arrives, it's all still thinking.
  const close = log.indexOf("</think>");
  const thinking = (close === -1 ? log : log.slice(0, close)).trim();
  const answer = close === -1 ? "" : log.slice(close + "</think>".length).trimStart();

  // Stick to the bottom as tokens stream in.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  // Escape to close, like the native popovers elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div class="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close log"
        class="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <aside
        class="card relative z-10 flex h-full w-[min(40rem,100vw)] flex-col rounded-none p-5 text-left shadow-pop"
        role="dialog"
        aria-label="Local model output"
      >
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="kicker">Local model</p>
            <p class="text-sm text-ink-2">
              {done ? "Finished." : "Streaming live — chain-of-thought included."}
            </p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        {request && (
          <div class="mt-4 grid gap-1">
            <p class="text-xs font-medium text-ink-2">
              POST <span class="font-mono">{request.endpoint}</span>
            </p>
            <pre class="max-h-40 overflow-auto rounded-lg bg-inset p-3 font-mono text-[11px] leading-relaxed text-ink-2">{JSON.stringify(request.body, null, 2)}</pre>
          </div>
        )}

        <p class="mt-4 text-xs font-medium text-ink-2">
          Thinking{close === -1 && log ? " (live)" : ""}
        </p>
        <pre class="mt-1 max-h-40 shrink-0 overflow-auto whitespace-pre-wrap rounded-lg bg-inset p-3 font-mono text-[11px] leading-relaxed text-ink-3">{thinking || (log ? "Model answered directly — no reasoning trace." : "Waiting for the first token…")}</pre>

        <p class="mt-4 text-xs font-medium text-ink-2">Final answer</p>
        <pre
          ref={logRef}
          class="mt-1 min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-inset p-3 font-mono text-[11px] leading-relaxed text-ink"
        >{answer || (close === -1 ? "…" : "")}</pre>
      </aside>
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
