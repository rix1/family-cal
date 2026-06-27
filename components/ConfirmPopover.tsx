import type { ComponentChildren } from "preact";

interface Props {
  /** Unique id linking the trigger to its popover — use a stable row key. */
  id: string;
  /** Trigger shown on the button (icon or text). */
  trigger: ComponentChildren;
  /** Visual classes for the trigger (e.g. an icon button or `btn btn-danger btn-sm`). */
  triggerClass: string;
  /** Accessible label / tooltip — important when the trigger is icon-only. */
  triggerLabel?: string;
  /** Confirmation copy shown in the dialog. */
  message: ComponentChildren;
  /** Text of the destructive confirm button. */
  confirmLabel: string;
  /** Hidden form fields that define the POST (action, id/token, …). */
  children: ComponentChildren;
}

/**
 * Confirmation dialog for a destructive action. Built on the native Popover API so
 * it renders in the top layer — never clipped by a scrolling/overflow table — with
 * built-in light-dismiss (click outside) and Escape. The trigger opens a small
 * centered card with a warning, a Cancel, and one danger button that submits the
 * POST. Use for every delete / remove / revoke so it's never one mis-click away.
 */
export function ConfirmPopover(
  { id, trigger, triggerClass, triggerLabel, message, confirmLabel, children }: Props,
) {
  return (
    <>
      <button
        type="button"
        class={triggerClass}
        aria-label={triggerLabel}
        title={triggerLabel}
        popovertarget={id}
      >
        {trigger}
      </button>
      <div
        id={id}
        popover="auto"
        class="confirm-popover card w-[min(24rem,calc(100vw-2rem))] gap-4 p-5 text-left shadow-pop"
      >
        <p class="text-sm text-ink-2">{message}</p>
        <form method="post" class="flex items-center justify-end gap-2">
          {children}
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            popovertarget={id}
            popovertargetaction="hide"
          >
            Cancel
          </button>
          <button type="submit" class="btn btn-danger btn-sm">{confirmLabel}</button>
        </form>
      </div>
    </>
  );
}
