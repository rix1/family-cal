import { AppHeader, MenuIcon } from "@/components/AppHeader.tsx";
import { EventForm } from "@/islands/EventForm.tsx";
import { PersonForm, type SavedGroup } from "@/islands/PersonForm.tsx";
import { ageAtDate, localizedMonthNames } from "@/lib/dates.ts";
import { retainAvailable, toggleSelection } from "@/lib/filter_selection.ts";
import { groupBadgeClass } from "@/lib/group_colors.ts";
import { dateLocale, t } from "@/lib/i18n.ts";
import type { CalendarViewData, ViewEvent, ViewPerson } from "@/lib/view_data.ts";
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";

type CalendarEvent =
  | {
    date: string;
    type: "birthday";
    name: string;
    person: ViewPerson;
    age: number | null;
    flare: string;
  }
  | {
    date: string;
    type: "holiday";
    name: string;
  }
  | {
    date: string;
    type: "memorial";
    name: string;
    person: ViewPerson;
  }
  | {
    date: string;
    type: "occasion";
    kind: string;
    name: string;
    occasion: ViewEvent;
    years: number | null;
  };

/** One table-view row, selected by next upcoming occurrence and dated by stored date. */
interface TableRow {
  key: string;
  name: string;
  date: string;
  nextDate: string;
  age: number | null;
  note: string;
  person: ViewPerson | null;
  /** Group key for the colored badge (birthdays/memorials); null for the rest. */
  affiliation: string | null;
  /** Neutral badge text for occasions/holidays. */
  badge: string | null;
}

type TableSortKey = "age" | "date" | "name" | "next";

const dayMs = 86_400_000;
const monthBatchSize = 12;
const maxPastMonths = 120;

function toKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function compareDateKeys(a: string, b: string): number {
  const partsA = a.split("-").map(Number);
  const partsB = b.split("-").map(Number);
  const fullA = partsA.length === 3;
  const fullB = partsB.length === 3;
  const timeA = fullA
    ? new Date(partsA[0], partsA[1] - 1, partsA[2]).getTime()
    : new Date(9999, partsA[0] - 1, partsA[1]).getTime();
  const timeB = fullB
    ? new Date(partsB[0], partsB[1] - 1, partsB[2]).getTime()
    : new Date(9999, partsB[0] - 1, partsB[1]).getTime();
  return timeA - timeB;
}

function compareMonthDayKeys(a: string, b: string): number {
  const partsA = a.split("-").map(Number);
  const partsB = b.split("-").map(Number);
  const monthA = partsA.length === 3 ? partsA[1] : partsA[0];
  const dayA = partsA.length === 3 ? partsA[2] : partsA[1];
  const monthB = partsB.length === 3 ? partsB[1] : partsB[0];
  const dayB = partsB.length === 3 ? partsB[2] : partsB[1];
  return monthA - monthB || dayA - dayB;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Locale-aware "15. jan." / "15 Jan" formatter, cached because shortDate runs in
// loops (heatmap tooltips, table rows).
const shortDateFormatters = new Map<string, Intl.DateTimeFormat>();
function shortDateFormat(): Intl.DateTimeFormat {
  const locale = dateLocale();
  let format = shortDateFormatters.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
    shortDateFormatters.set(locale, format);
  }
  return format;
}

function shortDate(date: string): string {
  return shortDateFormat().format(
    new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))),
  );
}

function monthDayOf(person: ViewPerson): string {
  if (!person.date) return "";
  return person.date.length === 10 ? person.date.slice(5) : person.date;
}

function hasYear(person: ViewPerson): boolean {
  return Boolean(person.date) && person.date.length === 10;
}

function ageOn(person: ViewPerson, year: number): number | null {
  return hasYear(person) ? year - Number(person.date.slice(0, 4)) : null;
}

function milestone(age: number | null): string {
  if (!Number.isFinite(age)) return "";
  if ([1, 10, 18, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100].includes(age!)) {
    return "major";
  }
  if (age! > 0 && age! % 10 === 0) return "major";
  if (age! > 0 && age! % 5 === 0) return "minor";
  return "";
}

// ---- Year heatmap experiment (delete this block + its call site to remove) ----

interface HeatmapEvent {
  date: string;
  text: string;
}

interface HeatmapCell {
  label: string;
  events: HeatmapEvent[];
  isCurrentWeek: boolean;
}

const heatmapCellSize = 13;
const heatmapGap = 4;
const heatmapColumns = 13;

/** One cell per week (Sun-Sat) spanning the full calendar `year`. */
function weekCells(
  year: number,
  eventMap: Map<string, string[]>,
  todayKey: string,
): HeatmapCell[] {
  const start = new Date(year, 0, 1);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(year, 11, 31);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const cells: HeatmapCell[] = [];
  let cursor = start;
  while (cursor <= end) {
    const events: HeatmapEvent[] = [];
    let firstInYear: Date | null = null;
    let isCurrentWeek = false;
    for (let i = 0; i < 7; i++) {
      const date = toKey(cursor);
      if (date === todayKey) isCurrentWeek = true;
      if (cursor.getFullYear() === year) {
        firstInYear ??= cursor;
        for (const text of eventMap.get(date) ?? []) events.push({ date, text });
      }
      cursor = addDays(cursor, 1);
    }
    events.sort((a, b) => a.date.localeCompare(b.date));
    const label = firstInYear
      ? t("calendar.weekOf", { date: shortDateFormat().format(firstInYear) })
      : "";
    cells.push({ label, events, isCurrentWeek });
  }
  return cells;
}

const heatmapLevelClasses = [
  "bg-inset",
  "bg-accent/25",
  "bg-accent/50",
  "bg-accent/75",
  "bg-accent",
];

function heatmapLevelClass(count: number, max: number): string {
  if (count <= 0 || max <= 0) return heatmapLevelClasses[0];
  const level = Math.max(1, Math.min(4, Math.ceil((count / max) * 4)));
  return heatmapLevelClasses[level];
}

const iconProps = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "1.4",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "aria-hidden": true,
} as const;

/* Four-point spark marking milestone birthdays. */
function SparkIcon({ class: cls = "size-3" }: { class?: string }) {
  return (
    <svg class={cls} {...iconProps}>
      <path d="M8 2.2 9.3 6.7 13.8 8 9.3 9.3 8 13.8 6.7 9.3 2.2 8 6.7 6.7Z" />
    </svg>
  );
}

/* Bulleted lines for the timeline view toggle. */
function ListIcon({ class: cls = "size-4" }: { class?: string }) {
  return (
    <svg class={cls} {...iconProps}>
      <path d="M5.5 4.5h8M5.5 8h8M5.5 11.5h8" />
      <path d="M2.4 4.5h.01M2.4 8h.01M2.4 11.5h.01" />
    </svg>
  );
}

/* Grid for the table view toggle. */
function TableIcon({ class: cls = "size-4" }: { class?: string }) {
  return (
    <svg class={cls} {...iconProps}>
      <rect x="2.5" y="3" width="11" height="10" rx="1.2" />
      <path d="M2.5 6.5h11M6.5 6.5V13" />
    </svg>
  );
}

/* Check mark for confirmed states. */
function CheckIcon({ class: cls = "size-4" }: { class?: string }) {
  return (
    <svg class={cls} {...iconProps}>
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

/* Event-type glyphs: cake, candle, rings, droplet, spark, pennant. */
function TypeIcon({ type, class: cls = "size-4" }: { type: string; class?: string }) {
  if (type === "memorial") {
    return (
      <svg class={cls} {...iconProps}>
        <path d="M6.6 13.5V9.2c0-.4.3-.7.7-.7h1.4c.4 0 .7.3.7.7v4.3" />
        <path d="M4.5 13.5h7" />
        <path d="M8 6.6c1-.7 1-2 0-2.9-1 .9-1 2.2 0 2.9Z" />
      </svg>
    );
  }
  if (type === "anniversary" || type === "wedding") {
    return (
      <svg class={cls} {...iconProps}>
        <circle cx="6" cy="9.2" r="3.4" />
        <circle cx="10" cy="9.2" r="3.4" />
      </svg>
    );
  }
  if (type === "baptism") {
    return (
      <svg class={cls} {...iconProps}>
        <path d="M8 2.5C5.7 5.6 4.6 7.7 4.6 9.5a3.4 3.4 0 0 0 6.8 0c0-1.8-1.1-3.9-3.4-7Z" />
      </svg>
    );
  }
  if (type === "confirmation") {
    return (
      <svg class={cls} {...iconProps}>
        <path d="M8 2.2 9.3 6.7 13.8 8 9.3 9.3 8 13.8 6.7 9.3 2.2 8 6.7 6.7Z" />
      </svg>
    );
  }
  if (type === "other") {
    return (
      <svg class={cls} {...iconProps}>
        <path d="M4.2 13.8V2.5" />
        <path d="M4.2 2.8h7.3L9.6 5.4l1.9 2.6H4.2" />
      </svg>
    );
  }
  return (
    <svg class={cls} {...iconProps}>
      <path d="M3.2 13.5V9.9c0-.7.6-1.3 1.3-1.3h7c.7 0 1.3.6 1.3 1.3v3.6" />
      <path d="M1.8 13.5h12.4" />
      <path d="M8 8.6V6.4" />
      <path d="M8 4.8c.8-.5.8-1.6 0-2.3-.8.7-.8 1.8 0 2.3Z" />
    </svg>
  );
}

/* Feed/export titles keep a type prefix so events stay recognizable inside
   Google/Apple calendars; the in-app UI itself renders no emoji. */
function exportIcon(type: string): string {
  if (type === "memorial") return "🕯️";
  if (type === "anniversary" || type === "wedding") return "💍";
  if (type === "baptism" || type === "confirmation" || type === "other") return "🎉";
  return "🎂";
}

const TYPE_LABEL_KEYS: Record<string, string> = {
  birthday: "calendar.type.birthday",
  memorial: "calendar.type.memorial",
  anniversary: "calendar.type.anniversary",
  holiday: "calendar.type.holiday",
  wedding: "calendar.type.wedding",
  baptism: "calendar.type.baptism",
  confirmation: "calendar.type.confirmation",
  other: "calendar.type.other",
};

function typeLabel(type: string): string {
  const key = TYPE_LABEL_KEYS[type];
  return key ? t(key) : type;
}

function occasionLabel(kind: string): string {
  if (kind === "wedding" || kind === "baptism" || kind === "confirmation") {
    return t(`eventKind.${kind}`);
  }
  return t("eventKind.generic");
}

function csvDateForMonthOffset(today: Date, offset: number): Date {
  return new Date(today.getFullYear(), today.getMonth() + offset, 1);
}

interface CalendarProps extends CalendarViewData {
  viewerName: string;
  editUrl?: string;
  saveUrl?: string;
  /** Editor endpoint for adding a single event (`/api/events/<token>`). */
  eventsSaveUrl?: string;
  logoutUrl?: string;
  /** Whether this viewer has opted into the monthly email. */
  subscribed?: boolean;
  /** Groups this viewer follows; groups outside this set show disabled in the filter. */
  followedGroups: string[];
  /** The viewer's own personal-list key, or null until its first use creates it. */
  personalKey?: string | null;
  /** Whether the getting-started checklist was dismissed ("I'll do this later"). */
  checklistDismissed?: boolean;
}

interface FilterOption {
  key: string;
  label: string;
  disabled?: boolean;
}

interface FilterSection {
  heading: string;
  options: FilterOption[];
  active: Set<string>;
  onToggle: (key: string) => void;
  footer?: ComponentChildren;
}

function FilterDropdown({ label, sections }: { label: string; sections: FilterSection[] }) {
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
      <div class="absolute right-0 z-30 mt-2 min-w-60 rounded-xl border border-line bg-surface p-1.5 shadow-pop">
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

export function Calendar({
  viewerName,
  groups: initialGroups,
  people: initialPeople,
  holidays,
  events: initialOccasions,
  editUrl,
  saveUrl,
  eventsSaveUrl,
  logoutUrl,
  subscribed = false,
  followedGroups: initialFollowedGroups,
  personalKey: initialPersonalKey = null,
  checklistDismissed: initialChecklistDismissed = false,
}: CalendarProps) {
  // Groups and the follow-list are state: saving a person can create a new
  // branch or the viewer's personal list, and both must appear (followed and
  // filter-active) without a reload.
  const [groups, setGroups] = useState(initialGroups);
  const [followedGroups, setFollowedGroups] = useState(initialFollowedGroups);
  const [personalKey, setPersonalKey] = useState(initialPersonalKey);
  const [people, setPeople] = useState(initialPeople);
  const [checklistDismissed, setChecklistDismissed] = useState(initialChecklistDismissed);
  const [occasions, setOccasions] = useState(initialOccasions);
  const [query, setQuery] = useState("");
  const allTypes = useMemo(
    () =>
      Array.from(
        new Set([
          ...people.map((p) => p.type || "birthday"),
          ...(people.some((person) => person.died) ? ["memorial"] : []),
          ...occasions.map((occasion) => occasion.kind),
          "holiday",
        ]),
      ),
    [people, occasions],
  );
  // Only the groups you follow have data; default the filter to them.
  const [activeGroups, setActiveGroups] = useState<Set<string>>(
    () => new Set(followedGroups),
  );
  const followed = useMemo(() => new Set(followedGroups), [followedGroups]);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    () => new Set(allTypes),
  );
  const [firstMonthOffset, setFirstMonthOffset] = useState(0);
  const [renderedMonthCount, setRenderedMonthCount] = useState(24);
  const [viewMode, setViewMode] = useState<"timeline" | "table">("timeline");
  const [tableSort, setTableSort] = useState<{ key: TableSortKey; dir: 1 | -1 }>({
    key: "age",
    dir: -1,
  });
  const [toast, setToast] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<ViewPerson | null>(null);
  const [personClosing, setPersonClosing] = useState(false);
  const [personOpen, setPersonOpen] = useState(false);
  // The detail slide-over doubles as the add/edit form: `editing` swaps its body
  // in place for the selected person, `adding` opens it for a brand-new person.
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const closePersonButton = useRef<HTMLButtonElement | null>(null);
  const personTrigger = useRef<HTMLElement | null>(null);
  const pendingScrollToPerson = useRef<ViewPerson | null>(null);
  const restoreScroll = useRef<{ y: number; height: number } | null>(null);
  const closePersonTimer = useRef<number | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayKey = toKey(today);
  const currentYear = today.getFullYear();
  // Locale is fixed for the lifetime of a page load (the language toggle does a
  // full reload), so the empty dependency arrays stay correct.
  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(dateLocale(), { weekday: "short", day: "numeric" }),
    [],
  );
  const longDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(dateLocale(), {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [],
  );
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(dateLocale(), { month: "long", year: "numeric" }),
    [],
  );
  const fullDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(dateLocale(), { day: "numeric", month: "long", year: "numeric" }),
    [],
  );
  const dayMonthFormatter = useMemo(
    () => new Intl.DateTimeFormat(dateLocale(), { day: "numeric", month: "long" }),
    [],
  );
  const tableDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(dateLocale(), { day: "numeric", month: "short", year: "numeric" }),
    [],
  );

  /** Render a stored date (YYYY-MM-DD, or MM-DD when the year is unknown) for reading. */
  function formatPersonDate(value: string | null | undefined): string {
    // "Unknown" is a stored data sentinel — compare literally, translate only the display.
    if (!value || value === "Unknown") return t("common.unknown");
    const parts = value.split("-").map(Number);
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return fullDateFormatter.format(new Date(year, month - 1, day));
    }
    const [month, day] = parts;
    return dayMonthFormatter.format(new Date(2000, month - 1, day));
  }

  function formatTableDate(value: string): string {
    return value.length === 10
      ? tableDateFormatter.format(parseDate(value))
      : formatPersonDate(value);
  }

  /**
   * Human-readable date in a semantic <time>, keeping the machine value
   * reachable via datetime/title. `short` renders the compact "Jul 12" form;
   * `children` lets callers supply their own inner markup (e.g. the timeline's
   * stacked day number + weekday).
   */
  function PersonDate({ value, short = false, class: cls, children }: {
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

  const personLookup = useMemo(
    () => new Map(people.map((person) => [person.id.toLowerCase(), person])),
    [people],
  );

  useEffect(() => {
    setActiveTypes((current) => retainAvailable(current, allTypes));
  }, [allTypes]);
  useEffect(() => {
    setActiveGroups((current) => retainAvailable(current, Object.keys(groups)));
  }, [groups]);

  function monthDate(offset: number) {
    return csvDateForMonthOffset(today, offset);
  }

  const rawEvents = useMemo(() => {
    const start = monthDate(firstMonthOffset);
    const end = monthDate(firstMonthOffset + renderedMonthCount - 1);
    const startYear = Math.min(currentYear - 1, start.getFullYear());
    const endYear = end.getFullYear();
    const out: CalendarEvent[] = [];

    for (let year = startYear; year <= endYear; year++) {
      for (const person of people) {
        if (person.date) {
          const md = monthDayOf(person);
          const date = `${year}-${md}`;
          if (!hasYear(person) || date >= person.date) {
            const age = ageOn(person, year);
            out.push({
              date,
              type: "birthday",
              name: person.name,
              person,
              age,
              flare: milestone(age),
            });
          }
        }
        if (person.died) {
          const diedMonthDay = person.died.slice(5);
          const memorialDate = `${year}-${diedMonthDay}`;
          if (memorialDate >= person.died) {
            out.push({
              date: memorialDate,
              type: "memorial",
              name: t("calendar.inMemoryOf", { name: person.name }),
              person,
            });
          }
        }
      }

      for (const occasion of occasions) {
        const hasYr = occasion.date.length === 10;
        const md = hasYr ? occasion.date.slice(5) : occasion.date;
        const date = `${year}-${md}`;
        if (hasYr && date < occasion.date) continue;
        out.push({
          date,
          type: "occasion",
          kind: occasion.kind,
          name: occasion.title,
          occasion,
          years: hasYr ? year - Number(occasion.date.slice(0, 4)) : null,
        });
      }
    }

    for (const holiday of holidays) {
      const year = Number(holiday.date.slice(0, 4));
      if (year >= startYear && year <= endYear) {
        out.push({ ...holiday, type: "holiday" });
      }
    }

    return out.sort(
      (a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type),
    );
  }, [people, holidays, occasions, firstMonthOffset, renderedMonthCount]);

  const events = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rawEvents.filter((event) => {
      if (event.type === "holiday") {
        if (!activeTypes.has("holiday")) return false;
        return !q || event.name.toLowerCase().includes(q);
      }
      if (event.type === "occasion") {
        if (!activeTypes.has(event.kind)) return false;
        if (!event.occasion.groups.some((group) => activeGroups.has(group))) return false;
        const haystack = `${event.name} ${event.occasion.notes}`.toLowerCase();
        return !q || haystack.includes(q);
      }
      if (!activeTypes.has(event.type)) return false;
      if (!activeGroups.has(event.person.affiliation)) return false;
      const haystack = `${event.name} ${event.person.notes || ""}`.toLowerCase();
      return !q || haystack.includes(q);
    });
  }, [rawEvents, activeGroups, activeTypes, query]);

  // Table view: one row per item, dated at its next upcoming occurrence.
  // `events` is sorted by date, so the first hit per identity is the next one.
  const tableRows = useMemo(() => {
    const seen = new Set<string>();
    const rows: TableRow[] = [];
    for (const event of events) {
      if (event.date < todayKey) continue;
      const key = event.type === "birthday"
        ? `birthday-${event.person.id}`
        : event.type === "memorial"
        ? `memorial-${event.person.id}`
        : event.type === "occasion"
        ? `occasion-${event.occasion.id}`
        : `holiday-${event.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (event.type === "birthday") {
        rows.push({
          key,
          name: event.name,
          date: event.person.date,
          nextDate: event.date,
          age: event.person.died
            ? ageAtDate(event.person.date, event.person.died)
            : ageAtDate(event.person.date, todayKey),
          note: event.person.notes || "",
          person: event.person,
          affiliation: event.person.affiliation,
          badge: null,
        });
      } else if (event.type === "memorial") {
        rows.push({
          key,
          name: event.name,
          date: event.person.died,
          nextDate: event.date,
          age: null,
          note: event.person.notes || "",
          person: event.person,
          affiliation: event.person.affiliation,
          badge: null,
        });
      } else if (event.type === "occasion") {
        rows.push({
          key,
          name: event.name,
          date: event.occasion.date,
          nextDate: event.date,
          age: event.years,
          note: event.occasion.notes || "",
          person: null,
          affiliation: null,
          badge: occasionLabel(event.kind),
        });
      } else {
        rows.push({
          key,
          name: event.name,
          date: event.date,
          nextDate: event.date,
          age: null,
          note: "",
          person: null,
          affiliation: null,
          badge: t("calendar.holiday"),
        });
      }
    }
    return rows;
  }, [events, todayKey]);

  const sortedTableRows = useMemo(() => {
    const dir = tableSort.dir;
    const byName = (a: TableRow, b: TableRow) => a.name.localeCompare(b.name, "nb");
    return [...tableRows].sort((a, b) => {
      if (tableSort.key === "name") return dir * byName(a, b);
      if (tableSort.key === "date") {
        return dir * compareMonthDayKeys(a.date, b.date) || byName(a, b);
      }
      if (tableSort.key === "next") {
        return dir * compareDateKeys(a.nextDate, b.nextDate) || byName(a, b);
      }
      // Ageless rows (holidays, remembrances) sink to the bottom either direction.
      if (a.age === null || b.age === null) {
        if (a.age === b.age) return byName(a, b);
        return a.age === null ? 1 : -1;
      }
      return dir * (a.age - b.age) || -dir * compareDateKeys(a.date, b.date) || byName(a, b);
    });
  }, [tableRows, tableSort]);

  function loadPastEvents() {
    if (firstMonthOffset <= -maxPastMonths) return;
    const delta = Math.min(monthBatchSize, maxPastMonths + firstMonthOffset);
    if (delta <= 0) return;
    restoreScroll.current = {
      y: globalThis.scrollY,
      height: document.documentElement.scrollHeight,
    };
    setFirstMonthOffset((n) => n - delta);
    setRenderedMonthCount((n) => n + delta);
  }

  useLayoutEffect(() => {
    const restore = restoreScroll.current;
    if (!restore) return;
    const nextHeight = document.documentElement.scrollHeight;
    const nextY = restore.y + (nextHeight - restore.height);
    const previousBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    globalThis.scrollTo(0, nextY);
    document.documentElement.style.scrollBehavior = previousBehavior;
    restoreScroll.current = null;
  }, [firstMonthOffset, renderedMonthCount]);

  useEffect(() => {
    if (viewMode !== "timeline") return;
    function onScroll() {
      const nearBottom = globalThis.innerHeight + globalThis.scrollY >
        document.documentElement.scrollHeight - 1200;
      if (nearBottom) setRenderedMonthCount((n) => n + monthBatchSize);
    }
    globalThis.addEventListener("scroll", onScroll, { passive: true });
    requestAnimationFrame(onScroll);
    return () => globalThis.removeEventListener("scroll", onScroll);
  }, [viewMode]);

  // The island renders "timeline" on the server; only flip after hydration.
  useEffect(() => {
    try {
      if (localStorage.getItem("family-cal:view") === "table") setViewMode("table");
    } catch { /* storage unavailable */ }
  }, []);

  function switchViewMode(mode: "timeline" | "table") {
    setViewMode(mode);
    try {
      localStorage.setItem("family-cal:view", mode);
    } catch { /* storage unavailable */ }
  }

  function toggleTableSort(key: TableSortKey) {
    setTableSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 1 ? -1 : 1 }
        // Fresh column: age starts oldest-first, date and name ascending.
        : { key, dir: key === "age" ? -1 : 1 }
    );
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  // The sheet shows for a selected person (detail/edit) or while adding. Drive
  // the entry animation and scroll lock off this single "is it on screen" flag
  // so switching detail <-> edit or person <-> person never re-animates.
  const sheetShown = Boolean(selectedPerson) || adding || addingEvent;
  useEffect(() => {
    if (!sheetShown) return;
    const raf = requestAnimationFrame(() => {
      setPersonOpen(true);
      closePersonButton.current?.focus();
    });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeSheet();
    }
    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = previousOverflow;
      globalThis.removeEventListener("keydown", onKeyDown);
      personTrigger.current?.focus();
    };
  }, [sheetShown]);

  useEffect(() => {
    return () => {
      if (closePersonTimer.current !== null) clearTimeout(closePersonTimer.current);
    };
  }, []);

  function relativeLabel(dateKey: string): string {
    const days = Math.round(
      (parseDate(dateKey).getTime() - parseDate(todayKey).getTime()) / dayMs,
    );
    if (days === 0) return t("calendar.rel.today");
    if (days === 1) return t("calendar.rel.tomorrow");
    if (days === -1) return t("calendar.rel.yesterday");
    if (days > 0) return t("calendar.rel.inDays", { days });
    return t("calendar.rel.daysAgo", { days: Math.abs(days) });
  }

  // `dropToday` skips the "… today" variant where a relative label already says it.
  function ageText(event: Extract<CalendarEvent, { type: "birthday" }>, dropToday = false) {
    if (event.age == null) return "";
    const age = event.age;
    if (event.person.died) return t("calendar.age.wouldHaveTurned", { age });
    if (event.date < todayKey) return t("calendar.age.turned", { age });
    if (event.date === todayKey && !dropToday) return t("calendar.age.turnsToday", { age });
    return t("calendar.age.turns", { age });
  }

  const upcoming = events.filter(
    (e) => e.type === "birthday" && !e.person.died && e.date >= todayKey,
  );
  const nextWindow = upcoming
    .filter((e) => e.date <= toKey(addDays(today, 120)))
    .slice(0, 6) as Extract<CalendarEvent, { type: "birthday" }>[];
  const recent = events
    .filter(
      (e) =>
        e.type === "birthday" &&
        !e.person.died &&
        e.date < todayKey &&
        e.date >= toKey(addDays(today, -90)),
    )
    .reverse()
    .slice(0, 5) as Extract<CalendarEvent, { type: "birthday" }>[];
  // Whose birthday is today — a gentle prompt for reflection, not an action.
  const todayMonthDay = todayKey.slice(5);
  const birthdaysToday = people.filter(
    (p) => p.date && activeGroups.has(p.affiliation) && monthDayOf(p) === todayMonthDay,
  );
  // Incomplete birth dates: no date at all, or a month-day with the year still unknown.
  const missing = people.filter((p) => !hasYear(p) && activeGroups.has(p.affiliation));
  // "Family roots": people whose notes link to no one else yet. While the tree is
  // being filled in this is a to-do list; once it is, the remainder are the top nodes.
  const familyRoots = people.filter((p) => {
    if (!activeGroups.has(p.affiliation)) return false;
    const regex = /@([a-z0-9-]+)/gi;
    let match;
    while ((match = regex.exec(p.notes || "")) !== null) {
      const id = match[1].toLowerCase();
      if (id !== p.id.toLowerCase() && personLookup.has(id)) return false;
    }
    return true;
  });
  const birthdayPeopleThisYear = people.filter((person) => {
    if (!person.date || person.died || !activeGroups.has(person.affiliation)) return false;
    const date = `${currentYear}-${monthDayOf(person)}`;
    return !hasYear(person) || date >= person.date;
  });
  const birthdaysCelebratedThisYear =
    birthdayPeopleThisYear.filter((person) => `${currentYear}-${monthDayOf(person)}` <= todayKey)
      .length;
  const birthdaysRemainingThisYear = Math.max(
    birthdayPeopleThisYear.length - birthdaysCelebratedThisYear,
    0,
  );
  const birthdayProgressPercent = birthdayPeopleThisYear.length
    ? Math.round((birthdaysCelebratedThisYear / birthdayPeopleThisYear.length) * 100)
    : 0;

  const yearEventMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const add = (date: string, label: string) => {
      const list = map.get(date);
      if (list) list.push(label);
      else map.set(date, [label]);
    };
    for (const person of people) {
      if (!activeGroups.has(person.affiliation)) continue;
      if (person.date && !person.died) {
        const md = monthDayOf(person);
        const date = `${currentYear}-${md}`;
        if (!hasYear(person) || date >= person.date) add(date, `🎂 ${person.name}`);
      }
      if (person.died) {
        const diedMd = person.died.slice(5);
        const date = `${currentYear}-${diedMd}`;
        if (date >= person.died) add(date, t("calendar.inMemoryOf", { name: person.name }));
      }
    }
    for (const occasion of occasions) {
      if (!occasion.groups.some((group) => activeGroups.has(group))) continue;
      const hasYr = occasion.date.length === 10;
      const md = hasYr ? occasion.date.slice(5) : occasion.date;
      const date = `${currentYear}-${md}`;
      if (hasYr && date < occasion.date) continue;
      add(date, occasion.title);
    }
    return map;
  }, [people, occasions, activeGroups, currentYear]);

  const heatmapCells = useMemo(
    () => weekCells(currentYear, yearEventMap, todayKey),
    [currentYear, yearEventMap, todayKey],
  );
  const heatmapMax = Math.max(1, ...heatmapCells.map((cell) => cell.events.length));
  const heatmapWrap = useRef<HTMLDivElement | null>(null);
  const [heatmapTip, setHeatmapTip] = useState<
    { cell: HeatmapCell; left: number; top: number } | null
  >(null);

  function showHeatmapTip(target: HTMLElement, cell: HeatmapCell) {
    const wrap = heatmapWrap.current;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const cellRect = target.getBoundingClientRect();
    setHeatmapTip({
      cell,
      left: cellRect.left - wrapRect.left + cellRect.width / 2,
      top: cellRect.top - wrapRect.top,
    });
  }

  function nextBirthdayDate(person: ViewPerson): string | null {
    const md = monthDayOf(person);
    if (!md) return null;
    const thisYear = `${currentYear}-${md}`;
    if ((!hasYear(person) || thisYear >= person.date) && thisYear >= todayKey) return thisYear;
    return `${currentYear + 1}-${md}`;
  }

  function nextMemorialDate(person: ViewPerson): string | null {
    if (!person.died) return null;
    const md = person.died.slice(5);
    const thisYear = `${currentYear}-${md}`;
    return thisYear >= todayKey ? thisYear : `${currentYear + 1}-${md}`;
  }

  function openPerson(person: ViewPerson) {
    if (closePersonTimer.current !== null) {
      clearTimeout(closePersonTimer.current);
      closePersonTimer.current = null;
    }
    // Only capture the focus origin on a fresh open; navigating between people
    // keeps the original trigger so focus lands back there when the sheet closes.
    if (!sheetShown) {
      personTrigger.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    setPersonClosing(false);
    setEditing(false);
    setAdding(false);
    setAddingEvent(false);
    setSelectedPerson(person);
  }

  function openAddPerson() {
    if (closePersonTimer.current !== null) {
      clearTimeout(closePersonTimer.current);
      closePersonTimer.current = null;
    }
    personTrigger.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setPersonClosing(false);
    setEditing(false);
    setAddingEvent(false);
    setSelectedPerson(null);
    setAdding(true);
  }

  function openAddEvent() {
    if (closePersonTimer.current !== null) {
      clearTimeout(closePersonTimer.current);
      closePersonTimer.current = null;
    }
    personTrigger.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setPersonClosing(false);
    setEditing(false);
    setAdding(false);
    setSelectedPerson(null);
    setAddingEvent(true);
  }

  // Swap the open sheet's body to the edit form in place — no re-animation.
  function openEditPerson() {
    setEditing(true);
  }

  function onPersonSaved(saved: ViewPerson, newGroup?: SavedGroup) {
    setPeople((current) =>
      current.some((p) => p.id === saved.id)
        ? current.map((p) => (p.id === saved.id ? saved : p))
        : [...current, saved]
    );
    if (newGroup) {
      // The save created (or resolved to) a group this page didn't know about:
      // register it, follow it, and switch it on in the filter so the person
      // just added is immediately visible.
      const { key, ...view } = newGroup;
      setGroups((current) => ({ ...current, [key]: view }));
      setFollowedGroups((current) => current.includes(key) ? current : [...current, key]);
      setActiveGroups((current) => new Set(current).add(key));
      if (newGroup.kind === "personal") setPersonalKey(key);
    }
    setEditing(false);
    setAdding(false);
    setSelectedPerson(saved); // sheet stays open; body swaps back to the detail view
    // A brand-new list or branch is the teachable moment — say what it means.
    setToast(
      newGroup?.kind === "personal"
        ? t("calendar.toast.savedOwnList", { name: saved.name })
        : newGroup
        ? t("calendar.toast.savedNewBranch", { name: saved.name, group: newGroup.label })
        : t("calendar.toast.saved", { name: saved.name }),
    );
  }

  function onEventSaved(saved: ViewEvent) {
    setOccasions((current) => [...current, saved]);
    setToast(t("calendar.toast.added", { title: saved.title }));
    closeSheet();
  }

  function cancelForm() {
    if (adding || addingEvent) closeSheet();
    else setEditing(false); // back to the detail view in place
  }

  function closeSheet() {
    if (!sheetShown || personClosing) return;
    setPersonOpen(false);
    setPersonClosing(true);
    closePersonTimer.current = setTimeout(() => {
      setSelectedPerson(null);
      setAdding(false);
      setAddingEvent(false);
      setEditing(false);
      setPersonClosing(false);
      closePersonTimer.current = null;
    }, 190);
  }

  function showPersonInTimeline(person: ViewPerson) {
    const next = nextBirthdayDate(person);
    if (!next) return;
    const targetYear = Number(next.slice(0, 4));
    const targetMonth = Number(next.slice(5, 7)) - 1;
    const monthsAhead = (targetYear - currentYear) * 12 + (targetMonth - today.getMonth());
    if (monthsAhead >= firstMonthOffset + renderedMonthCount) {
      setRenderedMonthCount(monthsAhead - firstMonthOffset + 1);
    }
    pendingScrollToPerson.current = person;
    closeSheet();
  }

  useEffect(() => {
    const person = pendingScrollToPerson.current;
    if (!person || selectedPerson) return;
    const next = nextBirthdayDate(person);
    if (!next) return;
    const target = document.querySelector(`#event-${person.id}-${next}`) ||
      document.querySelector(`#day-${next}`);
    if (!target) return;
    pendingScrollToPerson.current = null;
    requestAnimationFrame(() => target.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [selectedPerson, renderedMonthCount]);

  function scrollToToday() {
    const target = document.querySelector(`#day-${todayKey}`) ||
      document.querySelector(`#month-${todayKey.slice(0, 7)}`);
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function buildIcs() {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//family-cal//Family Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];
    const stamp = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}${
      String(
        today.getUTCDate(),
      ).padStart(2, "0")
    }T000000Z`;
    const q = query.trim().toLowerCase();
    const exported = people.filter(
      (p) =>
        p.date &&
        activeGroups.has(p.affiliation) &&
        activeTypes.has(p.type || "birthday") &&
        (!q || `${p.name} ${p.notes || ""}`.toLowerCase().includes(q)),
    );
    for (const [i, p] of exported.entries()) {
      const md = monthDayOf(p).replace("-", "");
      const sy = hasYear(p) ? p.date.slice(0, 4) : "2000";
      const summary = `${exportIcon(p.type)} ${p.name}`;
      const uid = `${md}-${i}-${p.name.replace(/[^a-z0-9]/gi, "")}@family-cal`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${sy}${md}`,
        "RRULE:FREQ=YEARLY",
        `SUMMARY:${summary}`,
        p.notes
          ? `DESCRIPTION:${p.notes.replace(/[,;\\]/g, "\\$&").replace(/\n/g, "\\n")}`
          : "DESCRIPTION:",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      );
    }
    const exportedOccasions = occasions.filter(
      (occasion) =>
        activeTypes.has(occasion.kind) &&
        occasion.groups.some((group) => activeGroups.has(group)) &&
        (!q ||
          `${occasion.title} ${occasion.notes}`
            .toLowerCase()
            .includes(q)),
    );
    for (const occasion of exportedOccasions) {
      const hasYr = occasion.date.length === 10;
      const md = (hasYr ? occasion.date.slice(5) : occasion.date).replace("-", "");
      const sy = hasYr ? occasion.date.slice(0, 4) : "2000";
      lines.push(
        "BEGIN:VEVENT",
        `UID:event-${occasion.id}@family-cal`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${sy}${md}`,
        "RRULE:FREQ=YEARLY",
        `SUMMARY:${exportIcon(occasion.kind)} ${occasion.title} (${
          occasionLabel(occasion.kind).toLowerCase()
        })`,
        occasion.notes
          ? `DESCRIPTION:${occasion.notes.replace(/[,;\\]/g, "\\$&").replace(/\n/g, "\\n")}`
          : "DESCRIPTION:",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR");
    return { ics: lines.join("\r\n"), count: exported.length + exportedOccasions.length };
  }

  function downloadIcs() {
    const { ics, count } = buildIcs();
    if (!count) return setToast(t("calendar.toast.nothingToExport"));
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "family-calendar.ics";
    link.click();
    URL.revokeObjectURL(url);
    setToast(
      count === 1
        ? t("calendar.toast.downloaded.one")
        : t("calendar.toast.downloaded.other", { count }),
    );
  }

  function SummaryCard({
    event,
    highlight = false,
  }: {
    event: Extract<CalendarEvent, { type: "birthday" }>;
    highlight?: boolean;
  }) {
    // "today" is already carried by the relative label, so drop ageText's suffix.
    const age = ageText(event, true);
    const relative = relativeLabel(event.date);
    const when = `${relative.charAt(0).toUpperCase()}${relative.slice(1)}`;
    return (
      <div
        class={`flex items-center gap-3 rounded-lg px-2.5 py-2 ${
          highlight ? "bg-accent-soft" : ""
        }`}
      >
        <div
          class={`grid size-10 shrink-0 place-items-center rounded-lg ${
            event.flare
              ? "bg-gold-soft text-gold"
              : highlight
              ? "bg-surface text-accent-2"
              : "bg-inset text-ink-2"
          }`}
        >
          <TypeIcon type={event.type} />
        </div>
        <div class="min-w-0">
          <p class="flex items-center gap-2 truncate text-sm">
            <button
              type="button"
              class="truncate text-left font-semibold hover:underline"
              onClick={() => openPerson(event.person)}
            >
              {event.name}
            </button>
            {highlight && <span class="badge bg-accent text-on-accent">{t("calendar.next")}</span>}
          </p>
          <p class="text-sm tabular-nums">
            <span class={`${highlight ? "text-accent-2" : "text-ink"}`}>
              {when}
            </span>
            <span class={highlight ? "text-accent-2/70" : "text-ink-3"}>
              {" · "}
              <PersonDate value={event.date} short />
              {age ? ` · ${age}` : ""}
            </span>
          </p>
        </div>
      </div>
    );
  }

  function EventCard({ event }: { event: CalendarEvent }) {
    if (event.type === "holiday") {
      return (
        <div class="rounded-lg bg-inset px-3.5 py-2.5">
          <p class="text-sm font-medium text-ink-2">{event.name}</p>
        </div>
      );
    }
    if (event.type === "occasion") {
      const yearsText = event.years && event.years > 0
        ? (event.years === 1 ? t("calendar.oneYear") : t("calendar.nYears", { count: event.years }))
        : "";
      return (
        <div
          id={`event-${event.occasion.id}-${event.date}`}
          class="card flex items-start gap-3 p-3"
        >
          <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-2">
            <TypeIcon type={event.kind} />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-semibold">{event.name}</p>
              <span class="badge bg-inset text-ink-2">{occasionLabel(event.kind)}</span>
            </div>
            <p class="mt-0.5 text-sm text-ink-2">
              {yearsText}
              {yearsText && event.occasion.notes && " · "}
              {event.occasion.notes
                ? linkedNotes(event.occasion.notes)
                : !yearsText && occasionLabel(event.kind)}
            </p>
          </div>
        </div>
      );
    }
    if (event.type === "memorial") {
      const group = groups[event.person.affiliation];
      // "i 2003, 22 år siden" — the death is a full YYYY-MM-DD date by model rule.
      const deathYear = Number(event.person.died!.slice(0, 4));
      const yearsSince = Number(event.date.slice(0, 4)) - deathYear;
      const sinceText = yearsSince === 1
        ? t("calendar.deathAnniversaryYears.one", { year: deathYear })
        : yearsSince > 1
        ? t("calendar.deathAnniversaryYears.other", { year: deathYear, count: yearsSince })
        : "";
      return (
        <div
          id={`event-${event.person.id}-${event.date}-memorial`}
          class="card flex items-start gap-3 p-3"
        >
          <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-inset text-ink-2">
            <TypeIcon type="memorial" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="font-semibold hover:underline"
                onClick={() => openPerson(event.person)}
              >
                {t("calendar.inMemoryOf", { name: event.person.name })}
              </button>
              {group && (
                <span class={`badge ml-auto ${groupBadgeClass(group.color)}`}>
                  {group.label}
                </span>
              )}
            </div>
            <p class="mt-0.5 text-sm text-ink-2">
              {t("calendar.deathAnniversary")}
              {sinceText && ` — ${sinceText}`}
              {event.person.notes && <>{" · "}{linkedNotes(event.person.notes)}</>}
            </p>
          </div>
        </div>
      );
    }
    const group = groups[event.person.affiliation];
    const age = ageText(event);
    const notes = event.person.notes;
    return (
      <div
        id={`event-${event.person.id}-${event.date}`}
        class="card flex items-start gap-3 p-3"
      >
        <div
          class={`grid size-10 shrink-0 place-items-center rounded-lg ${
            event.flare ? "bg-gold-soft text-gold" : "bg-accent-soft text-accent-2"
          }`}
        >
          <TypeIcon type={event.person.died ? "memorial" : event.type} />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="font-semibold hover:underline"
              onClick={() => openPerson(event.person)}
            >
              {event.name}
            </button>
            {event.flare && (
              <span class="badge bg-gold-soft text-gold">
                <SparkIcon /> {event.age}
              </span>
            )}
            {group && (
              <span class={`badge ml-auto ${groupBadgeClass(group.color)}`}>
                {group.label}
              </span>
            )}
          </div>
          <p class="mt-0.5 text-sm text-ink-2">
            {age}
            {age && notes && " · "}
            {notes ? linkedNotes(notes) : !age && t("calendar.birthday")}
          </p>
        </div>
      </div>
    );
  }

  function linkedNotes(text: string) {
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
              onClick={() => openPerson(linkedPerson)}
            >
              @{linkedPerson.name}
            </button>
          )
          : `@${mentionId}`,
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes.length ? nodes : text;
  }

  function personDetail(person: ViewPerson) {
    const next = nextBirthdayDate(person);
    const nextMemorial = nextMemorialDate(person);
    const group = groups[person.affiliation];
    const age = hasYear(person) ? currentYear - Number(person.date.slice(0, 4)) : null;
    const born = person.date || "Unknown";
    const ageAtDeath = ageAtDate(person.date || null, person.died || null);
    // Incoming backlinks: people whose notes @-mention this person, oldest first.
    const id = person.id.toLowerCase();
    const mentionedBy = people
      .filter((p) => {
        if (p.id.toLowerCase() === id) return false;
        const regex = /@([a-z0-9-]+)/gi;
        let match;
        while ((match = regex.exec(p.notes || "")) !== null) {
          if (match[1].toLowerCase() === id) return true;
        }
        return false;
      })
      .map((p) => ({
        person: p,
        age: hasYear(p) ? currentYear - Number(p.date.slice(0, 4)) : null,
      }))
      .sort((a, b) =>
        (b.age ?? -Infinity) - (a.age ?? -Infinity) ||
        a.person.name.localeCompare(b.person.name, "nb")
      );
    return { next, nextMemorial, group, age, ageAtDeath, born, mentionedBy };
  }

  function DayGroup({
    dateKey,
    dayEvents,
  }: {
    dateKey: string;
    dayEvents: CalendarEvent[];
  }) {
    const isToday = dateKey === todayKey;
    const d = parseDate(dateKey);
    return (
      <div
        id={`day-${dateKey}`}
        class="grid gap-x-4 gap-y-2 sm:grid-cols-[72px_1fr]"
        style={{ scrollMarginTop: "118px" }}
      >
        <PersonDate
          value={dateKey}
          class="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-1 sm:pt-2.5 sm:text-right"
        >
          <span
            class={`text-xl font-semibold leading-none tabular-nums ${
              isToday ? "text-accent-2" : "text-ink"
            }`}
          >
            {d.getDate()}
          </span>
          <span class={`kicker ${isToday ? "text-accent-2" : ""}`}>
            {dayFormatter.format(d).slice(0, 3)}
          </span>
          {isToday && (
            <span class="badge bg-accent text-on-accent sm:mt-1">
              {t("calendar.today")}
            </span>
          )}
        </PersonDate>
        <div class="space-y-2">
          {dayEvents.length
            ? (
              dayEvents.map((event) => (
                <EventCard
                  key={`${event.type}-${event.date}-${event.name}`}
                  event={event}
                />
              ))
            )
            : (
              <div class="rounded-lg border border-dashed border-line-2 px-3.5 py-3 text-sm text-ink-3">
                {t("calendar.nothingToday")}
              </div>
            )}
        </div>
      </div>
    );
  }

  function SortHeader({
    label,
    sortKey,
    align = "left",
  }: {
    label: string;
    sortKey: TableSortKey;
    align?: "left" | "right";
  }) {
    const active = tableSort.key === sortKey;
    return (
      <th
        scope="col"
        aria-sort={active ? (tableSort.dir === 1 ? "ascending" : "descending") : undefined}
        class={`px-4 py-2.5 ${align === "right" ? "text-right" : "text-left"}`}
      >
        <button
          type="button"
          onClick={() => toggleTableSort(sortKey)}
          class={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${
            active ? "text-ink" : "text-ink-3 hover:text-ink"
          }`}
        >
          {label}
          <svg
            class={`size-3 ${active ? "" : "invisible"} ${
              active && tableSort.dir === 1 ? "rotate-180" : ""
            }`}
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
        </button>
      </th>
    );
  }

  const selectedDetail = selectedPerson ? personDetail(selectedPerson) : null;

  // The default forward view trims the current month to today onward; once past
  // months are loaded the current month is mid-timeline, so show all of it.
  const pastLoaded = firstMonthOffset < 0;
  const months = [];
  for (let offset = firstMonthOffset; offset < firstMonthOffset + renderedMonthCount; offset++) {
    const d = monthDate(offset);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const isCurrent = key === todayKey.slice(0, 7);
    const monthEvents = events.filter(
      (e) => e.date.slice(0, 7) === key && (!isCurrent || pastLoaded || e.date >= todayKey),
    );
    if (!monthEvents.length && !isCurrent) continue;
    const byDay = new Map<string, CalendarEvent[]>();
    if (isCurrent) byDay.set(todayKey, []);
    for (const event of monthEvents) {
      if (!byDay.has(event.date)) byDay.set(event.date, []);
      byDay.get(event.date)!.push(event);
    }
    months.push({
      key,
      date: d,
      events: monthEvents,
      // today is seeded first for its empty-state slot; sort so it lands in date order.
      days: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    });
  }

  return (
    <>
      <AppHeader
        title={longDateFormatter.format(today)}
        viewerName={viewerName}
        current="calendar"
        adminUrl={editUrl}
        logoutUrl={logoutUrl}
        menuChildren={
          <>
            {saveUrl && (
              <button type="button" onClick={openAddPerson}>
                <MenuIcon>
                  <circle cx="9" cy="8" r="3.5" />
                  <path d="M3 19v-1a3.5 3.5 0 0 1 3.5-3.5h5A3.5 3.5 0 0 1 15 18v1M18 8v6M21 11h-6" />
                </MenuIcon>
                {t("personForm.add")}
              </button>
            )}
            {eventsSaveUrl && (
              <button type="button" onClick={openAddEvent}>
                <MenuIcon>
                  <path d="M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M12 12v5M9.5 14.5h5" />
                </MenuIcon>
                {t("eventForm.submit")}
              </button>
            )}
            <button type="button" onClick={downloadIcs}>
              <MenuIcon>
                <path d="M12 4v11M8 11l4 4 4-4M5 20h14" />
              </MenuIcon>
              {t("calendar.exportIcs")}
            </button>
            <a href="/calendar/?welcome=1">
              <MenuIcon>
                <path d="M20 12a8 8 0 1 1-2.5-5.8M18.8 3V8.2H14" />
              </MenuIcon>
              {t("calendar.showTour")}
            </a>
          </>
        }
      >
        <button
          type="button"
          class="btn btn-primary"
          onClick={scrollToToday}
        >
          {t("calendar.today")}
        </button>
      </AppHeader>

      <main class="mx-auto max-w-5xl px-4 pb-20 pt-6">
        {followedGroups.length === 0 && (
          <div class="mb-4 flex items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-accent-2">
            <svg
              class="size-5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16v.01" />
            </svg>
            <p class="leading-relaxed">
              <span class="font-semibold">{t("calendar.noGroups.title")}</span>{" "}
              {t("calendar.noGroups.before")}{" "}
              <a href="/profile/" class="font-semibold underline underline-offset-2">
                {t("about.profileLink")}
              </a>.
            </p>
          </div>
        )}
        <section class="mb-4 grid gap-3 sm:grid-cols-3">
          <article class="card p-5">
            <p class="kicker">{t("calendar.thisYear")}</p>
            <p class="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
              {birthdaysCelebratedThisYear}
              <span class="font-normal text-ink-3">/{birthdayPeopleThisYear.length}</span>
            </p>
            <p class="mt-1 text-sm text-ink-2">{t("calendar.birthdaysCelebrated")}</p>
            <div
              class="mt-4 h-1 overflow-hidden rounded-full bg-inset"
              aria-hidden="true"
            >
              <div
                class="h-full rounded-full bg-accent"
                style={{ width: `${birthdayProgressPercent}%` }}
              />
            </div>
            <p class="mt-3 text-sm text-ink-3">
              {birthdaysRemainingThisYear === 0
                ? t("calendar.allBehind")
                : t("calendar.stillAhead", { count: birthdaysRemainingThisYear })}
            </p>

            {
              /* Year heatmap experiment: delete this <div> through the legend below,
                plus the heatmap state/memos above, to remove it cleanly. */
            }
            <div class="mt-6 flex gap-1.5">
              <div class="flex flex-col justify-between">
                <span class="text-[0.625rem] text-ink-3">
                  {localizedMonthNames(dateLocale(), "short")[0]}
                </span>
                <span class="text-[0.625rem] text-ink-3">
                  {localizedMonthNames(dateLocale(), "short")[11]}
                </span>
              </div>
              <div ref={heatmapWrap} class="relative">
                <div
                  class="grid"
                  style={{
                    gridTemplateColumns: `repeat(${heatmapColumns}, ${heatmapCellSize}px)`,
                    gap: `${heatmapGap}px`,
                  }}
                >
                  {heatmapCells.map((cell, i) => (
                    <div
                      key={i}
                      tabIndex={0}
                      aria-label={cell.events.length
                        ? `${cell.label}: ${cell.events.length} ${
                          cell.events.length === 1
                            ? t("calendar.eventOne")
                            : t("calendar.eventOther")
                        }, ${cell.events.map((event) => event.text).join(", ")}`
                        : cell.label}
                      onMouseEnter={(e) => showHeatmapTip(e.currentTarget, cell)}
                      onMouseLeave={() => setHeatmapTip(null)}
                      onFocus={(e) => showHeatmapTip(e.currentTarget, cell)}
                      onBlur={() => setHeatmapTip(null)}
                      class={`rounded-[2px] outline-none ${
                        heatmapLevelClass(cell.events.length, heatmapMax)
                      } ${cell.isCurrentWeek ? "ring-2 ring-accent" : ""}`}
                      style={{ width: `${heatmapCellSize}px`, height: `${heatmapCellSize}px` }}
                    />
                  ))}
                </div>
                <div
                  class={`heatmap-tip ${heatmapTip ? "visible" : ""}`}
                  style={heatmapTip
                    ? { left: `${heatmapTip.left}px`, top: `${heatmapTip.top}px` }
                    : undefined}
                >
                  {heatmapTip && (
                    <>
                      <p class="text-[0.625rem] font-semibold uppercase tracking-wide text-page/60">
                        {heatmapTip.cell.label}
                      </p>
                      {heatmapTip.cell.events.length
                        ? (
                          <ul class="mt-0.5 grid gap-0.5">
                            {heatmapTip.cell.events.map((event, i) => (
                              <li key={i}>
                                {shortDate(event.date)}: {event.text}
                              </li>
                            ))}
                          </ul>
                        )
                        : <p class="mt-0.5">{t("calendar.noEvents")}</p>}
                    </>
                  )}
                </div>
                <div class="mt-1.5 flex items-center justify-end gap-1 text-[0.625rem] text-ink-3">
                  <span>{t("calendar.less")}</span>
                  {heatmapLevelClasses.map((cls, level) => (
                    <span
                      key={level}
                      class={`rounded-[2px] ${cls}`}
                      style={{ width: "9px", height: "9px" }}
                    />
                  ))}
                  <span>{t("calendar.more")}</span>
                </div>
              </div>
            </div>
          </article>
          <article class="card p-5 sm:col-span-2">
            <div class="flex items-baseline justify-between gap-3">
              <p class="kicker">{t("calendar.nextUp")}</p>
              <p class="text-xs text-ink-3">{t("calendar.next120")}</p>
            </div>
            <div class="mt-3 grid gap-1 sm:grid-cols-2">
              {nextWindow.length
                ? (
                  nextWindow.map((event, i) => (
                    <SummaryCard
                      key={`${event.date}-${event.person.id}`}
                      event={event}
                      highlight={i === 0}
                    />
                  ))
                )
                : (
                  <p class="text-sm text-ink-2">
                    {t("calendar.emptyNext120")}
                  </p>
                )}
            </div>
          </article>
        </section>

        <section class="mb-6 grid gap-3 lg:grid-cols-[1fr_0.72fr]">
          <article class="card p-5">
            <p class="kicker">{t("calendar.recentlyCelebrated")}</p>
            <div class="mt-3 grid gap-1">
              {recent.length
                ? (
                  recent.map((event) => (
                    <SummaryCard
                      key={`${event.date}-${event.person.id}`}
                      event={event}
                    />
                  ))
                )
                : (
                  <p class="text-sm text-ink-2">
                    {t("calendar.emptyLast90")}
                  </p>
                )}
            </div>
          </article>
          <article class="card flex flex-col gap-4 p-5">
            <p class="kicker">{t("calendar.inFocus")}</p>
            {birthdaysToday.map((p) => {
              const gone = Boolean(p.died);
              const age = ageOn(p, currentYear);
              return (
                <div
                  key={p.id}
                  class="rounded-lg border border-accent/30 bg-accent-soft px-3.5 py-3"
                >
                  <p class="text-sm font-medium text-accent-2">
                    {gone
                      ? t("calendar.remembering", { name: p.name })
                      : t("calendar.todayBirthday", { name: p.name })}
                    {!gone && age != null && (
                      <span class="font-normal text-ink-3">
                        {` · ${t("calendar.age.turns", { age })}`}
                      </span>
                    )}
                  </p>
                  <p class="mt-1 text-xs leading-relaxed text-ink-2">
                    {gone
                      ? t("calendar.rememberingHint")
                      : t("calendar.birthdayPrompt", { name: p.name })}
                  </p>
                </div>
              );
            })}
            {missing.length > 0 && (
              <div>
                <p class="text-sm font-medium">
                  {missing.length === 1
                    ? t("calendar.missingDates.one")
                    : t("calendar.missingDates.other", { count: missing.length })}
                </p>
                <p class="mt-0.5 text-xs text-ink-3">
                  {t("calendar.missingHint")}
                </p>
                <div class="mt-2.5 flex flex-wrap gap-1.5">
                  {missing.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openPerson(p)}
                      class="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 hover:border-line-2 hover:text-ink"
                      title={p.notes}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* While the getting-started checklist is up, keep the card focused on it. */}
            {checklistDismissed && (
              <>
                <div>
                  <p class="text-sm font-medium">{t("calendar.familyRoots")}</p>
                  {familyRoots.length
                    ? (
                      <>
                        <p class="mt-0.5 text-xs text-ink-3">
                          {t("calendar.rootsHint")}
                        </p>
                        <div class="mt-2.5 flex flex-wrap gap-1.5">
                          {familyRoots.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => openPerson(p)}
                              class="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 hover:border-line-2 hover:text-ink"
                              title={p.notes}
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      </>
                    )
                    : (
                      <p class="mt-0.5 text-xs text-ink-3">
                        {t("calendar.allLinked")}
                      </p>
                    )}
                </div>
                <a
                  href="/recall/"
                  class="group flex items-center gap-3 rounded-lg border border-line-2 px-3.5 py-3 text-sm transition-colors hover:bg-inset"
                >
                  <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-2">
                    <SparkIcon class="size-4" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block font-medium">{t("calendar.recall")}</span>
                    <span class="mt-0.5 block text-xs text-ink-3">
                      {t("calendar.recallHint")}
                    </span>
                  </span>
                  <span
                    class="text-ink-3 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </a>
              </>
            )}
            {
              /* mt-auto pins the small profile link to the card bottom once dismissed;
               the checklist itself sits right under the content above it. */
            }
            <div class={checklistDismissed ? "mt-auto" : ""}>
              {!checklistDismissed
                ? (
                  <div class="rounded-lg border border-accent/30 bg-accent-soft px-3.5 py-3">
                    <div class="flex items-baseline justify-between gap-2">
                      <p class="text-sm font-medium text-accent-2">
                        {t("calendar.checklist.title")}
                      </p>
                      <button
                        type="button"
                        class="text-xs font-medium text-ink-3 hover:text-ink"
                        onClick={() => {
                          setChecklistDismissed(true);
                          fetch("/api/welcome", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ action: "dismiss-checklist" }),
                          }).catch(() => {/* worst case: the card shows again */});
                        }}
                      >
                        {t("calendar.checklist.later")}
                      </button>
                    </div>
                    <ul class="mt-2 grid gap-1">
                      {[
                        {
                          label: t("calendar.checklist.groups"),
                          done: followedGroups.length > 0,
                        },
                        {
                          label: t("calendar.checklist.feed"),
                          done: false,
                        },
                        {
                          label: t("calendar.checklist.email"),
                          done: subscribed,
                        },
                      ].map((item) => (
                        <li key={item.label}>
                          <a
                            href="/profile/"
                            class="group flex items-center gap-2.5 rounded-md px-1.5 py-1 text-sm hover:bg-surface/60"
                          >
                            {item.done
                              ? (
                                <span class="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                                  <CheckIcon class="size-3" />
                                </span>
                              )
                              : (
                                <span class="size-5 shrink-0 rounded-full border-2 border-accent/40" />
                              )}
                            <span
                              class={item.done
                                ? "text-ink-3 line-through decoration-ink-3/50"
                                : "font-medium text-ink"}
                            >
                              {item.label}
                            </span>
                            {!item.done && (
                              <span
                                class="ml-auto text-ink-3 transition-transform group-hover:translate-x-0.5"
                                aria-hidden="true"
                              >
                                →
                              </span>
                            )}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
                : (
                  <a
                    href="/profile/"
                    class="group inline-flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink"
                  >
                    {t("calendar.profileSummary")}
                    <span
                      class="transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </a>
                )}
            </div>
          </article>
        </section>

        <section class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label class="relative block w-full lg:max-w-xs">
            <svg
              class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" />
            </svg>
            <input
              type="search"
              value={query}
              onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
              placeholder={t("calendar.searchPlaceholder")}
              class="input pl-9"
            />
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <FilterDropdown
              label={t("calendar.show")}
              sections={[
                {
                  heading: t("calendar.filter.events"),
                  options: allTypes.map((type) => ({ key: type, label: typeLabel(type) })),
                  active: activeTypes,
                  onToggle: (type) => setActiveTypes((current) => toggleSelection(current, type)),
                },
                {
                  heading: t("calendar.filter.groups"),
                  options: Object.entries(groups).map(([key, group]) => ({
                    key,
                    label: group.label,
                    disabled: !followed.has(key),
                  })),
                  active: activeGroups,
                  onToggle: (key) => setActiveGroups((current) => toggleSelection(current, key)),
                  footer: (
                    <p class="text-xs leading-relaxed text-ink-3">
                      {t("calendar.filter.groupsFooter")}{" "}
                      <a
                        href="/profile/"
                        class="font-medium text-accent-2 underline underline-offset-2"
                      >
                        {t("about.profileLink")}
                      </a>.
                    </p>
                  ),
                },
              ]}
            />
            <div
              role="group"
              aria-label={t("calendar.viewSwitch")}
              class="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5"
            >
              <button
                type="button"
                title={t("calendar.viewTimeline")}
                aria-pressed={viewMode === "timeline"}
                onClick={() => switchViewMode("timeline")}
                class={`grid size-8 place-items-center rounded-md ${
                  viewMode === "timeline" ? "bg-inset text-ink" : "text-ink-3 hover:text-ink"
                }`}
              >
                <ListIcon />
              </button>
              <button
                type="button"
                title={t("calendar.viewTable")}
                aria-pressed={viewMode === "table"}
                onClick={() => switchViewMode("table")}
                class={`grid size-8 place-items-center rounded-md ${
                  viewMode === "table" ? "bg-inset text-ink" : "text-ink-3 hover:text-ink"
                }`}
              >
                <TableIcon />
              </button>
            </div>
          </div>
        </section>

        {viewMode === "table" && (
          <section class="card overflow-x-auto" aria-label={t("calendar.upcoming")}>
            <table class="w-full min-w-[34rem] text-sm">
              <thead>
                <tr class="border-b border-line">
                  <SortHeader label={t("personForm.name")} sortKey="name" />
                  <SortHeader label={t("calendar.table.birthdate")} sortKey="date" />
                  <SortHeader label={t("calendar.nextBirthday")} sortKey="next" />
                  <SortHeader label={t("calendar.table.age")} sortKey="age" align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedTableRows.map((row) => {
                  const group = row.affiliation ? groups[row.affiliation] : undefined;
                  return (
                    <tr key={row.key} class="border-b border-line last:border-b-0">
                      <td class="px-4 py-2.5">
                        <div class="flex flex-wrap items-center gap-2">
                          {row.person
                            ? (
                              <button
                                type="button"
                                class="text-left font-medium hover:underline"
                                onClick={() => openPerson(row.person!)}
                              >
                                {row.name}
                              </button>
                            )
                            : <span class="font-medium">{row.name}</span>}
                          {group && (
                            <span class={`badge ${groupBadgeClass(group.color)}`}>
                              {group.label}
                            </span>
                          )}
                          {row.badge && <span class="badge bg-inset text-ink-2">{row.badge}</span>}
                        </div>
                        {row.note && (
                          <p class="mt-0.5 text-xs text-ink-3">{linkedNotes(row.note)}</p>
                        )}
                      </td>
                      <td class="whitespace-nowrap px-4 py-2.5 align-top tabular-nums text-ink-2">
                        <PersonDate value={row.date}>
                          {formatTableDate(row.date)}
                        </PersonDate>
                      </td>
                      <td class="whitespace-nowrap px-4 py-2.5 align-top tabular-nums text-ink-2">
                        <PersonDate value={row.nextDate}>
                          {formatTableDate(row.nextDate)}
                        </PersonDate>
                      </td>
                      <td class="px-4 py-2.5 text-right align-top tabular-nums">
                        {row.age ?? <span class="text-ink-3">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!sortedTableRows.length && (
              <p class="p-6 text-center text-sm text-ink-3">
                {t("calendar.emptyTable")}
              </p>
            )}
          </section>
        )}

        <div class={viewMode === "table" ? "hidden" : "mb-6 flex justify-center"}>
          <button
            type="button"
            onClick={loadPastEvents}
            disabled={firstMonthOffset <= -maxPastMonths}
            class="btn btn-ghost btn-sm"
          >
            {firstMonthOffset <= -maxPastMonths ? t("calendar.noMorePast") : t("calendar.loadPast")}
          </button>
        </div>

        <section class={viewMode === "table" ? "hidden" : "space-y-8"}>
          {months.length
            ? (
              months.map((m) => (
                <section
                  key={m.key}
                  id={`month-${m.key}`}
                  style={{ scrollMarginTop: "64px" }}
                >
                  <div class="sticky top-[57px] z-10 -mx-4 border-b border-line bg-page/85 px-4 py-2.5 backdrop-blur-md">
                    <div class="mx-auto flex max-w-5xl items-baseline justify-between">
                      <h2 class="text-base font-semibold">
                        {monthFormatter.format(m.date)}
                      </h2>
                      <span class="text-xs tabular-nums text-ink-3">
                        {m.events.length}{" "}
                        {m.events.length === 1 ? t("calendar.eventOne") : t("calendar.eventOther")}
                      </span>
                    </div>
                  </div>
                  <div class="mt-4 space-y-4">
                    {m.days.map(([date, dayEvents]) => (
                      <DayGroup key={date} dateKey={date} dayEvents={dayEvents} />
                    ))}
                  </div>
                </section>
              ))
            )
            : (
              <p class="rounded-xl border border-dashed border-line-2 p-6 text-center text-sm text-ink-3">
                {t("calendar.emptyTimeline")}
              </p>
            )}
          <div class="py-6 text-center text-sm text-ink-3">
            {t("calendar.scrollMore")}
          </div>
        </section>
      </main>

      {sheetShown && (
        <div
          class={`backdrop fixed inset-0 z-40 flex items-end bg-black/30 sm:items-stretch sm:justify-end ${
            personClosing ? "is-closing" : ""
          }`}
          onClick={closeSheet}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="person-detail-title"
            class={`sheet flex max-h-[88vh] w-full flex-col overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-6 shadow-pop sm:max-h-none sm:w-[26rem] sm:rounded-none sm:border-t-0 sm:border-l ${
              personOpen ? "is-open" : ""
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-line-2 sm:hidden" />
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="kicker">
                  {addingEvent
                    ? t("eventForm.submit")
                    : adding
                    ? t("personForm.add")
                    : editing
                    ? t("calendar.editPerson")
                    : t("calendar.person")}
                </p>
                <h2 id="person-detail-title" class="mt-1 text-xl font-semibold tracking-tight">
                  {addingEvent
                    ? t("calendar.newEvent")
                    : adding
                    ? t("calendar.newPerson")
                    : selectedPerson?.name}
                </h2>
                {!adding && !addingEvent && !editing && selectedDetail?.group && (
                  <span class={`badge mt-1.5 ${groupBadgeClass(selectedDetail.group.color)}`}>
                    {selectedDetail.group.label}
                  </span>
                )}
              </div>
              <button
                ref={closePersonButton}
                type="button"
                class="grid size-8 shrink-0 place-items-center rounded-full border border-line-2 bg-surface text-ink-2 hover:bg-inset hover:text-ink"
                onClick={closeSheet}
                aria-label={t("common.close")}
              >
                <svg
                  class="size-3.5"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>

            {addingEvent && eventsSaveUrl
              ? (
                <EventForm
                  groups={groups}
                  people={people}
                  saveUrl={eventsSaveUrl}
                  onSaved={onEventSaved}
                  onCancel={cancelForm}
                />
              )
              : (editing || adding) && saveUrl
              ? (
                <PersonForm
                  person={adding ? null : selectedPerson}
                  groups={groups}
                  personalKey={personalKey}
                  people={people}
                  saveUrl={saveUrl}
                  onSaved={onPersonSaved}
                  onCancel={cancelForm}
                />
              )
              : selectedPerson && selectedDetail
              ? (
                <>
                  <dl class="mt-6 grid grid-cols-2 gap-2 text-sm">
                    <div class="rounded-lg bg-inset p-3">
                      <dt class="kicker">{t("personForm.born")}</dt>
                      <dd class="mt-1 font-medium tabular-nums">
                        <PersonDate value={selectedDetail.born} />
                      </dd>
                    </div>
                    <div class="rounded-lg bg-inset p-3">
                      <dt class="kicker">
                        {selectedPerson.died
                          ? t("calendar.wouldBeThisYear")
                          : t("calendar.ageThisYear")}
                      </dt>
                      <dd class="mt-1 font-medium tabular-nums">
                        {selectedDetail.age ?? t("common.unknown")}
                      </dd>
                    </div>
                    {selectedPerson.died && (
                      <>
                        <div class="rounded-lg bg-inset p-3">
                          <dt class="kicker">{t("personForm.died")}</dt>
                          <dd class="mt-1 font-medium tabular-nums">
                            <PersonDate value={selectedPerson.died} />
                          </dd>
                        </div>
                        <div class="rounded-lg bg-inset p-3">
                          <dt class="kicker">{t("calendar.ageAtDeath")}</dt>
                          <dd class="mt-1 font-medium tabular-nums">
                            {selectedDetail.ageAtDeath ?? t("common.unknown")}
                          </dd>
                        </div>
                      </>
                    )}
                    <div class="col-span-2 rounded-lg bg-inset p-3">
                      <dt class="kicker">{t("calendar.nextBirthday")}</dt>
                      <dd class="mt-1 font-medium tabular-nums">
                        {selectedDetail.next
                          ? (
                            <>
                              <PersonDate value={selectedDetail.next} /> ·{" "}
                              {relativeLabel(selectedDetail.next)}
                            </>
                          )
                          : t("common.unknown")}
                      </dd>
                    </div>
                    {selectedDetail.nextMemorial && (
                      <div class="col-span-2 rounded-lg bg-inset p-3">
                        <dt class="kicker">{t("calendar.nextRemembrance")}</dt>
                        <dd class="mt-1 font-medium tabular-nums">
                          <PersonDate value={selectedDetail.nextMemorial} /> ·{" "}
                          {relativeLabel(selectedDetail.nextMemorial)}
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div class="mt-2 rounded-lg bg-inset p-3">
                    <p class="kicker">{t("common.notes")}</p>
                    <p class="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-ink-2">
                      {selectedPerson.notes
                        ? linkedNotes(selectedPerson.notes)
                        : t("calendar.noNotes")}
                    </p>
                  </div>

                  {selectedDetail.mentionedBy.length > 0 && (
                    <div class="mt-4">
                      <p class="kicker">
                        {t("calendar.mentionedBy", { count: selectedDetail.mentionedBy.length })}
                      </p>
                      <ul class="mt-2 grid gap-0.5">
                        {selectedDetail.mentionedBy.map(({ person, age }) => (
                          <li key={person.id}>
                            <button
                              type="button"
                              onClick={() => openPerson(person)}
                              class="flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1 text-left text-sm hover:bg-inset"
                              title={person.notes}
                            >
                              <span class="font-medium">{person.name}</span>
                              <span class="tabular-nums text-ink-3">
                                {age === null
                                  ? "—"
                                  : age === 1
                                  ? t("calendar.oneYear")
                                  : t("calendar.nYears", { count: age })}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(saveUrl || editUrl || selectedDetail.next) && (
                    <div class="mt-6 grid gap-2 sm:mt-auto">
                      {saveUrl && (
                        <button
                          type="button"
                          class="btn btn-ghost w-full"
                          onClick={openEditPerson}
                        >
                          {t("calendar.editPerson")}
                        </button>
                      )}
                      {!saveUrl && editUrl && (
                        <a
                          class="btn btn-ghost w-full"
                          href={`${editUrl}?person=${encodeURIComponent(selectedPerson.id)}`}
                        >
                          {t("calendar.editPerson")}
                        </a>
                      )}
                      {selectedDetail.next && (
                        <button
                          type="button"
                          class="btn btn-primary w-full"
                          onClick={() => showPersonInTimeline(selectedPerson)}
                        >
                          {t("calendar.showInTimeline")}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )
              : null}
          </aside>
        </div>
      )}

      <div
        role="status"
        class={`toast fixed bottom-4 left-1/2 z-30 max-w-[calc(100%-2rem)] -translate-x-1/2 ${
          toast ? "visible" : ""
        }`}
      >
        {toast}
      </div>
    </>
  );
}
