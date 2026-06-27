import { useState } from "preact/hooks";

interface Props {
  /** Button label at rest. */
  label: string;
  /** Label while the request is in flight. */
  pendingLabel: string;
  /** Button classes (match the surrounding btn styles). */
  class?: string;
  /** Optional hint shown under the button while pending, e.g. expected wait. */
  pendingHint?: string;
}

/**
 * Submit button that flips to a visible busy state and keeps it through the
 * full-page POST/redirect — so a slow server action (regenerating a draft runs
 * the local model for ~15-30s; sending emails each recipient) shows progress
 * instead of an unresponsive page. Nielsen heuristic #1: visibility of system
 * status. Falls back to a plain submit if JS hasn't hydrated yet.
 */
export function PendingSubmit(
  { label, pendingLabel, class: cls = "btn btn-primary", pendingHint }: Props,
) {
  const [pending, setPending] = useState(false);

  return (
    <div class="grid gap-1.5">
      <button
        type="submit"
        class={cls}
        disabled={pending}
        aria-busy={pending ? "true" : undefined}
        onClick={(event) => {
          const form = (event.currentTarget as HTMLButtonElement).form;
          if (!form || !form.checkValidity()) return; // let native validation surface
          event.preventDefault();
          setPending(true);
          // Paint the busy state before the blocking submit/navigation begins.
          requestAnimationFrame(() => form.requestSubmit());
        }}
      >
        {pending
          ? (
            <span class="inline-flex items-center gap-2">
              <span
                class="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
              {pendingLabel}
            </span>
          )
          : label}
      </button>
      {pending && pendingHint && <p class="text-xs text-ink-3">{pendingHint}</p>}
    </div>
  );
}
