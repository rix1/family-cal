import { t } from "@/lib/i18n.ts";

export type AddChoice = "person" | "event";

const glyphProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "1.6",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "aria-hidden": true,
} as const;

/**
 * First step of the add flow: pick whether you're adding a person or an
 * event, read what that means, then continue to the matching form. Lives in
 * the same slide-over as the forms, so continuing swaps the body in place.
 */
export function AddChooser({
  canPerson,
  canEvent,
  choice,
  onChoice,
  onContinue,
}: {
  canPerson: boolean;
  canEvent: boolean;
  choice: AddChoice;
  onChoice: (choice: AddChoice) => void;
  onContinue: () => void;
}) {
  const options = [
    ...(canPerson ? [{ key: "person" as const, label: t("addChooser.person") }] : []),
    ...(canEvent ? [{ key: "event" as const, label: t("addChooser.event") }] : []),
  ];
  return (
    <div class="mt-6 flex flex-col gap-4">
      {options.length > 1 && (
        <div
          role="group"
          aria-label={t("addChooser.title")}
          class="grid grid-cols-2 gap-0.5 rounded-xl border border-line bg-surface p-0.5"
        >
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={choice === option.key}
              onClick={() => onChoice(option.key)}
              class={`rounded-[0.625rem] px-3 py-2 text-sm font-medium transition-colors ${
                choice === option.key ? "bg-accent-soft text-accent-2" : "text-ink-3 hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <div class="flex flex-col items-center gap-3 rounded-xl bg-inset px-5 py-6 text-center">
        <span class="grid size-14 place-items-center rounded-full bg-accent-soft text-accent-2">
          {choice === "person"
            ? (
              <svg class="size-6" {...glyphProps}>
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
              </svg>
            )
            : (
              <svg class="size-6" {...glyphProps}>
                <path d="M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M12 12v5M9.5 14.5h5" />
              </svg>
            )}
        </span>
        <p class="text-sm leading-relaxed text-ink-2">
          {choice === "person" ? t("addChooser.person.body") : t("addChooser.event.body")}
        </p>
        {choice === "person" && (
          <p class="text-xs leading-relaxed text-ink-3">
            {t("addChooser.person.note")}
          </p>
        )}
      </div>
      <button
        type="button"
        class="btn btn-primary min-h-12 rounded-full text-base"
        onClick={onContinue}
      >
        {choice === "person" ? t("personForm.add") : t("eventForm.submit")}
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
