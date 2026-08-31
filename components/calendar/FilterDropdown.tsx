import type { ComponentChildren } from "preact";

export interface FilterOption {
  key: string;
  label: string;
  disabled?: boolean;
}

export interface FilterSection {
  heading: string;
  options: FilterOption[];
  active: Set<string>;
  onToggle: (key: string) => void;
  footer?: ComponentChildren;
}

export function FilterDropdown({ label, sections }: { label: string; sections: FilterSection[] }) {
  const selectable = sections.reduce(
    (sum, section) => sum + section.options.filter((option) => !option.disabled).length,
    0,
  );
  const active = sections.reduce((sum, section) => sum + section.active.size, 0);
  // Outside-click / Escape close is handled globally by PopoverBehavior (see the
  // `data-popover` attribute below).
  return (
    <details data-popover class="relative">
      <summary class="btn btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span>{label}</span>
        <span class="text-xs font-medium tabular-nums text-ink-3">
          {active}/{selectable}
        </span>
        <svg
          class="size-3 text-ink-3"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 4.5L6 8l3.5-3.5" />
        </svg>
      </summary>
      {
        /* Left-anchored where the trigger sits at the page's left edge (mobile);
         right-anchored on lg, where the filter row is right-aligned. The max
         caps keep the panel inside the viewport whatever the content. */
      }
      <div class="absolute left-0 z-30 mt-2 max-h-[70vh] min-w-60 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-pop lg:left-auto lg:right-0">
        {sections.map((section, index) => (
          <div
            key={section.heading}
            class={index === 0 ? "" : "mt-1 border-t border-line pt-1"}
          >
            <div class="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              {section.heading}
            </div>
            {section.options.map((option) => (
              <label
                key={option.key}
                class={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium ${
                  option.disabled
                    ? "cursor-not-allowed text-ink-3"
                    : "cursor-pointer hover:bg-inset"
                }`}
              >
                <input
                  type="checkbox"
                  checked={section.active.has(option.key)}
                  disabled={option.disabled}
                  onChange={() => section.onToggle(option.key)}
                  class="size-4 accent-accent"
                />
                <span>{option.label}</span>
              </label>
            ))}
            {section.footer && (
              <div class="mt-1 border-t border-line px-2.5 pb-1 pt-2">{section.footer}</div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
