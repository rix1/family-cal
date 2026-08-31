import { t } from "@/lib/i18n.ts";
import type { ViewPerson } from "@/lib/view_data.ts";
import type { ComponentChildren } from "preact";
import { formatPersonDate, shortDate } from "@/lib/calendar/dates.ts";

/**
 * Human-readable date in a semantic <time>, keeping the machine value
 * reachable via datetime/title. `short` renders the compact "Jul 12" form;
 * `children` lets callers supply their own inner markup (e.g. the timeline's
 * stacked day number + weekday).
 */
export function PersonDate({ value, short = false, class: cls, children }: {
  value: string | null | undefined;
  short?: boolean;
  class?: string;
  children?: ComponentChildren;
}) {
  if (!value || value === "Unknown") return <>{children ?? t("common.unknown")}</>;
  return (
    <time dateTime={value} title={value} class={cls}>
      {children ?? (short ? shortDate(value) : formatPersonDate(value))}
    </time>
  );
}

/** Notes flattened to one plain-text line: @-mentions become bare names. */
export function plainNotes(text: string, personLookup: Map<string, ViewPerson>): string {
  return text
    .replace(/@([a-z0-9-]+)/gi, (_, id) => personLookup.get(id.toLowerCase())?.name ?? id)
    .replace(/\s+/g, " ")
    .trim();
}

/** Notes text with @-mentions of known people turned into open-person links. */
export function LinkedNotes({ text, personLookup, onOpenPerson }: {
  text: string;
  /** Roster keyed by lowercased person id, for resolving @-mentions. */
  personLookup: Map<string, ViewPerson>;
  onOpenPerson: (person: ViewPerson) => void;
}) {
  const nodes = [];
  const regex = /@([a-z0-9-]+)/gi;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const mentionId = match[1].toLowerCase();
    const linkedPerson = personLookup.get(mentionId);
    nodes.push(
      linkedPerson
        ? (
          <button
            type="button"
            class="font-medium text-accent-2 underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            onClick={() => onOpenPerson(linkedPerson)}
          >
            @{linkedPerson.name}
          </button>
        )
        : `@${mentionId}`,
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return <>{nodes.length ? nodes : text}</>;
}
