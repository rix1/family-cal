import { AppHeader } from "@/components/AppHeader.tsx";
import type { CalendarViewData, ViewPerson } from "@/lib/view_data.ts";
import { ageAtDate } from "@/lib/dates.ts";
import { retainAvailable, toggleSelection } from "@/lib/filter_selection.ts";
import { activeMention, insertMention, type MentionMatch } from "@/lib/mentions.ts";
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
    countries: Array<"NO" | "DK">;
  }
  | {
    date: string;
    type: "memorial";
    name: string;
    person: ViewPerson;
  };

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

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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

/* Event-type glyphs: cake, candle, rings. */
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
  if (type === "anniversary") {
    return (
      <svg class={cls} {...iconProps}>
        <circle cx="6" cy="9.2" r="3.4" />
        <circle cx="10" cy="9.2" r="3.4" />
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
  if (type === "anniversary") return "💍";
  return "🎂";
}

function typeLabel(type: string): string {
  if (type === "birthday") return "Birthdays";
  if (type === "memorial") return "Remembrances";
  if (type === "anniversary") return "Anniversaries";
  if (type === "holiday") return "Public holidays";
  return type;
}

function csvDateForMonthOffset(today: Date, offset: number): Date {
  return new Date(today.getFullYear(), today.getMonth() + offset, 1);
}

function countryPills(countries: Array<"NO" | "DK">) {
  return countries.map((country) => {
    const styles = country === "NO" ? "bg-norway-soft text-norway" : "bg-denmark-soft text-denmark";
    return <span class={`badge ${styles}`}>{country}</span>;
  });
}

interface CalendarProps extends CalendarViewData {
  viewerName: string;
  editUrl?: string;
  saveUrl?: string;
  logoutUrl?: string;
}

interface PersonDraft {
  name: string;
  born: string;
  died: string;
  groups: string[];
  notes: string;
}

interface PersonMentionMenu {
  match: MentionMatch;
  activeIndex: number;
}

const birthDateValid = (value: string) =>
  value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{2}-\d{2}$/.test(value);
const deathDateValid = (value: string) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value);

function FilterDropdown({
  label,
  options,
  active,
  onToggle,
}: {
  label: string;
  options: Array<{ key: string; label: string }>;
  active: Set<string>;
  onToggle: (key: string) => void;
}) {
  const details = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!details.current?.contains(event.target as Node)) {
        details.current?.removeAttribute("open");
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") details.current?.removeAttribute("open");
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    globalThis.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      globalThis.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details ref={details} class="relative">
      <summary class="btn btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span>{label}</span>
        <span class="text-xs font-medium tabular-nums text-ink-3">
          {active.size}/{options.length}
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
      <div class="absolute right-0 z-30 mt-2 min-w-56 rounded-xl border border-line bg-surface p-1.5 shadow-pop">
        {options.map((option) => (
          <label
            key={option.key}
            class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-inset"
          >
            <input
              type="checkbox"
              checked={active.has(option.key)}
              onChange={() => onToggle(option.key)}
              class="size-4 accent-accent"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export function Calendar({
  viewerName,
  groups,
  people: initialPeople,
  holidays,
  editUrl,
  saveUrl,
  logoutUrl,
}: CalendarProps) {
  const [people, setPeople] = useState(initialPeople);
  const [query, setQuery] = useState("");
  const allTypes = useMemo(
    () =>
      Array.from(
        new Set([
          ...people.map((p) => p.type || "birthday"),
          ...(people.some((person) => person.died) ? ["memorial"] : []),
          "holiday",
        ]),
      ),
    [people],
  );
  const [activeGroups, setActiveGroups] = useState<Set<string>>(
    () => new Set(Object.keys(groups)),
  );
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    () => new Set(allTypes),
  );
  const [firstMonthOffset, setFirstMonthOffset] = useState(0);
  const [renderedMonthCount, setRenderedMonthCount] = useState(24);
  const [toast, setToast] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<ViewPerson | null>(null);
  const [personClosing, setPersonClosing] = useState(false);
  const [personOpen, setPersonOpen] = useState(false);
  const [personDraft, setPersonDraft] = useState<PersonDraft | null>(null);
  const [personMentionMenu, setPersonMentionMenu] = useState<PersonMentionMenu | null>(null);
  const [personSaveState, setPersonSaveState] = useState<"idle" | "saving">("idle");
  const [personSaveError, setPersonSaveError] = useState("");
  const closePersonButton = useRef<HTMLButtonElement | null>(null);
  const personNotesInput = useRef<HTMLTextAreaElement | null>(null);
  const personTrigger = useRef<HTMLElement | null>(null);
  const pendingScrollToPerson = useRef<ViewPerson | null>(null);
  const restoreScroll = useRef<{ y: number; height: number } | null>(null);
  const closePersonTimer = useRef<number | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayKey = toKey(today);
  const currentYear = today.getFullYear();
  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric" }),
    [],
  );
  const longDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [],
  );
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }),
    [],
  );
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
              name: `In memory of ${person.name}`,
              person,
            });
          }
        }
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
  }, [people, holidays, firstMonthOffset, renderedMonthCount]);

  const events = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rawEvents.filter((event) => {
      if (!activeTypes.has(event.type)) return false;
      if (event.type !== "holiday" && !activeGroups.has(event.person.group)) {
        return false;
      }
      if (q) {
        const haystack = event.type !== "holiday"
          ? `${event.name} ${event.person.notes || ""}`.toLowerCase()
          : event.name.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rawEvents, activeGroups, activeTypes, query]);

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
    function onScroll() {
      const nearBottom = globalThis.innerHeight + globalThis.scrollY >
        document.documentElement.scrollHeight - 1200;
      if (nearBottom) setRenderedMonthCount((n) => n + monthBatchSize);
    }
    globalThis.addEventListener("scroll", onScroll, { passive: true });
    requestAnimationFrame(onScroll);
    return () => globalThis.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!selectedPerson) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      setPersonOpen(true);
      closePersonButton.current?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closePerson();
    }

    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      globalThis.removeEventListener("keydown", onKeyDown);
      personTrigger.current?.focus();
    };
  }, [selectedPerson?.id]);

  useEffect(() => {
    return () => {
      if (closePersonTimer.current !== null) clearTimeout(closePersonTimer.current);
    };
  }, []);

  function relativeLabel(dateKey: string): string {
    const days = Math.round(
      (parseDate(dateKey).getTime() - parseDate(todayKey).getTime()) / dayMs,
    );
    if (days === 0) return "today";
    if (days === 1) return "tomorrow";
    if (days === -1) return "yesterday";
    if (days > 0) return `in ${days} days`;
    return `${Math.abs(days)} days ago`;
  }

  function ageText(event: Extract<CalendarEvent, { type: "birthday" }>) {
    if (event.age == null) return "";
    if (event.person.died) return `would have turned ${event.age}`;
    if (event.date < todayKey) return `turned ${event.age}`;
    if (event.date === todayKey) return `turns ${event.age} today`;
    return `turns ${event.age}`;
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
  const missing = people.filter((p) => !p.date && activeGroups.has(p.group));
  const birthdayPeopleThisYear = people.filter((person) => {
    if (!person.date || person.died || !activeGroups.has(person.group)) return false;
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
    if (closePersonTimer.current !== null) clearTimeout(closePersonTimer.current);
    personTrigger.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setPersonClosing(false);
    setPersonOpen(false);
    setPersonDraft(null);
    setPersonMentionMenu(null);
    setPersonSaveError("");
    setSelectedPerson(person);
  }

  function closePerson() {
    if (!selectedPerson || personClosing) return;
    setPersonOpen(false);
    setPersonClosing(true);
    closePersonTimer.current = setTimeout(() => {
      setSelectedPerson(null);
      setPersonClosing(false);
      setPersonDraft(null);
      setPersonMentionMenu(null);
      closePersonTimer.current = null;
    }, 190);
  }

  function startPersonEdit(person: ViewPerson) {
    setPersonSaveError("");
    setPersonDraft({
      name: person.name,
      born: person.date,
      died: person.died,
      groups: person.groups,
      notes: person.notes,
    });
  }

  function togglePersonGroup(group: string) {
    if (!personDraft) return;
    setPersonDraft({
      ...personDraft,
      groups: personDraft.groups.includes(group)
        ? personDraft.groups.filter((key) => key !== group)
        : [...personDraft.groups, group],
    });
  }

  function updatePersonMentionMenu(input: HTMLTextAreaElement) {
    const match = activeMention(input.value, input.selectionStart ?? input.value.length);
    setPersonMentionMenu(match ? { match, activeIndex: 0 } : null);
  }

  function personMentionSuggestions(menu: PersonMentionMenu) {
    return people
      .filter((person) => {
        const query = menu.match.query;
        return person.id.toLowerCase().includes(query) ||
          person.name.toLowerCase().includes(query);
      })
      .slice(0, 6);
  }

  function choosePersonMention(person: ViewPerson) {
    if (!personDraft || !personMentionMenu) return;
    const result = insertMention(personDraft.notes, personMentionMenu.match, person.id);
    setPersonDraft({ ...personDraft, notes: result.text });
    setPersonMentionMenu(null);
    requestAnimationFrame(() => {
      personNotesInput.current?.focus();
      personNotesInput.current?.setSelectionRange(result.cursor, result.cursor);
    });
  }

  async function savePerson() {
    if (!selectedPerson || !personDraft || !saveUrl) return;
    if (!personDraft.name.trim()) return setPersonSaveError("Name is required.");
    if (!birthDateValid(personDraft.born)) {
      return setPersonSaveError("Born must be YYYY-MM-DD, MM-DD, or empty.");
    }
    if (!deathDateValid(personDraft.died)) {
      return setPersonSaveError("Died must be YYYY-MM-DD or empty.");
    }

    setPersonSaveState("saving");
    setPersonSaveError("");
    try {
      const response = await fetch(saveUrl, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selectedPerson.id,
          person: {
            name: personDraft.name,
            born: personDraft.born || null,
            died: personDraft.died || null,
            groups: personDraft.groups,
            notes: personDraft.notes,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setPersonSaveError(body.error || `Couldn't save (${response.status}).`);
        return;
      }
      const saved = body.person;
      const next: ViewPerson = {
        id: saved.id,
        name: saved.name,
        date: saved.born || "",
        died: saved.died || "",
        groups: saved.groups || [],
        group: saved.groups?.[0] || "",
        notes: saved.notes || "",
        type: "birthday",
      };
      setPeople((current) => current.map((person) => person.id === next.id ? next : person));
      setSelectedPerson((current) => current?.id === next.id ? next : current);
      setPersonDraft(null);
      setToast(`Saved ${next.name}.`);
    } catch {
      setPersonSaveError("Couldn't reach the server.");
    } finally {
      setPersonSaveState("idle");
    }
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
    closePerson();
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
        activeGroups.has(p.group) &&
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
    lines.push("END:VCALENDAR");
    return { ics: lines.join("\r\n"), count: exported.length };
  }

  function downloadIcs() {
    const { ics, count } = buildIcs();
    if (!count) return setToast("No dated people match the current filters.");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "family-calendar.ics";
    link.click();
    URL.revokeObjectURL(url);
    setToast(
      `Downloaded ${count} recurring ${count === 1 ? "birthday" : "birthdays"}.`,
    );
  }

  function SummaryCard({
    event,
    highlight = false,
  }: {
    event: Extract<CalendarEvent, { type: "birthday" }>;
    highlight?: boolean;
  }) {
    const text = ageText(event);
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
            {highlight && <span class="badge bg-accent text-on-accent">Next</span>}
          </p>
          <p class={`text-sm tabular-nums ${highlight ? "text-accent-2" : "text-ink-2"}`}>
            {relativeLabel(event.date)}
            {text ? ` · ${text}` : ""}
          </p>
        </div>
      </div>
    );
  }

  function EventCard({ event }: { event: CalendarEvent }) {
    if (event.type === "holiday") {
      return (
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-inset px-3.5 py-2.5">
          <p class="text-sm font-medium text-ink-2">{event.name}</p>
          <div class="flex gap-1">{countryPills(event.countries)}</div>
        </div>
      );
    }
    if (event.type === "memorial") {
      const group = groups[event.person.group];
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
                In memory of {event.person.name}
              </button>
              {group && (
                <span class="badge bg-inset text-ink-2">
                  {group.label}
                </span>
              )}
            </div>
            <p class="mt-0.5 text-sm text-ink-2">
              Anniversary of their death
              {event.person.notes ? ` · ${event.person.notes}` : ""}
            </p>
          </div>
        </div>
      );
    }
    const group = groups[event.person.group];
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
              <span class="badge bg-inset text-ink-2">
                {group.label}
              </span>
            )}
          </div>
          <p class="mt-0.5 text-sm text-ink-2">
            {[ageText(event), event.person.notes]
              .filter(Boolean)
              .join(" · ") || "Birthday"}
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
    const group = groups[person.group];
    const age = hasYear(person) ? currentYear - Number(person.date.slice(0, 4)) : null;
    const born = person.date || "Unknown";
    const ageAtDeath = ageAtDate(person.date || null, person.died || null);
    return { next, nextMemorial, group, age, ageAtDeath, born };
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
        <div class="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-1 sm:pt-2.5 sm:text-right">
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
              Today
            </span>
          )}
        </div>
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
                Nothing planned today
              </div>
            )}
        </div>
      </div>
    );
  }

  const selectedDetail = selectedPerson ? personDetail(selectedPerson) : null;

  const months = [];
  for (let offset = firstMonthOffset; offset < firstMonthOffset + renderedMonthCount; offset++) {
    const d = monthDate(offset);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const isCurrent = key === todayKey.slice(0, 7);
    const monthEvents = events.filter(
      (e) => e.date.slice(0, 7) === key && (!isCurrent || e.date >= todayKey),
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
      days: [...byDay.entries()],
    });
  }

  return (
    <>
      <AppHeader
        title={longDateFormatter.format(today)}
        viewerName={viewerName}
        adminUrl={editUrl}
        logoutUrl={logoutUrl}
        menuChildren={
          <button type="button" onClick={downloadIcs}>
            Export .ics
          </button>
        }
      >
        <button
          type="button"
          class="btn btn-primary"
          onClick={scrollToToday}
        >
          Today
        </button>
      </AppHeader>

      <main class="mx-auto max-w-5xl px-4 pb-20 pt-6">
        <section class="mb-4 grid gap-3 sm:grid-cols-3">
          <article class="card p-5">
            <p class="kicker">This year</p>
            <p class="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
              {birthdaysCelebratedThisYear}
              <span class="font-normal text-ink-3">/{birthdayPeopleThisYear.length}</span>
            </p>
            <p class="mt-1 text-sm text-ink-2">birthdays celebrated</p>
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
                ? "All known birthdays are behind us."
                : `${birthdaysRemainingThisYear} still ahead this year.`}
            </p>
          </article>
          <article class="card p-5 sm:col-span-2">
            <div class="flex items-baseline justify-between gap-3">
              <p class="kicker">Next up</p>
              <p class="text-xs text-ink-3">next 120 days</p>
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
                    Nothing in the next 120 days for this filter.
                  </p>
                )}
            </div>
          </article>
        </section>

        <section class="mb-6 grid gap-3 lg:grid-cols-[1fr_0.72fr]">
          <article class="card p-5">
            <p class="kicker">Recently celebrated</p>
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
                    Nothing in the last 90 days for this filter.
                  </p>
                )}
            </div>
          </article>
          <article class="card p-5">
            <p class="kicker">Missing dates</p>
            <div class="mt-3 flex flex-wrap gap-1.5">
              {missing.length
                ? (
                  missing.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openPerson(p)}
                      class="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 hover:border-line-2 hover:text-ink"
                      title={p.notes}
                    >
                      {p.name}
                    </button>
                  ))
                )
                : (
                  <p class="text-sm text-ink-2">
                    All dates filled in.
                  </p>
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
              placeholder="Search by name or note…"
              class="input pl-9"
            />
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <FilterDropdown
              label="Families"
              options={Object.entries(groups).map(([key, group]) => ({
                key,
                label: `${group.label}`,
              }))}
              active={activeGroups}
              onToggle={(key) => setActiveGroups((current) => toggleSelection(current, key))}
            />
            <FilterDropdown
              label="Events"
              options={allTypes.map((type) => ({ key: type, label: typeLabel(type) }))}
              active={activeTypes}
              onToggle={(type) => setActiveTypes((current) => toggleSelection(current, type))}
            />
          </div>
        </section>

        <div class="mb-6 flex justify-center">
          <button
            type="button"
            onClick={loadPastEvents}
            disabled={firstMonthOffset <= -maxPastMonths}
            class="btn btn-ghost btn-sm"
          >
            {firstMonthOffset <= -maxPastMonths ? "No more past events loaded" : "Load past events"}
          </button>
        </div>

        <section class="space-y-8">
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
                        {m.events.length} {m.events.length === 1 ? "event" : "events"}
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
                No events match the current filters.
              </p>
            )}
          <div class="py-6 text-center text-sm text-ink-3">
            Scroll for more months…
          </div>
        </section>
      </main>

      {selectedPerson && selectedDetail && (
        <div
          class={`backdrop fixed inset-0 z-40 flex items-end bg-black/30 sm:items-stretch sm:justify-end ${
            personClosing ? "is-closing" : ""
          }`}
          onClick={closePerson}
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
                <p class="kicker">Person</p>
                <h2 id="person-detail-title" class="mt-1 text-xl font-semibold tracking-tight">
                  {selectedPerson.name}
                </h2>
                {selectedDetail.group && (
                  <p class="mt-1.5 text-sm text-ink-2">
                    {selectedDetail.group.label}
                  </p>
                )}
              </div>
              <button
                ref={closePersonButton}
                type="button"
                class="grid size-8 shrink-0 place-items-center rounded-full border border-line-2 bg-surface text-ink-2 hover:bg-inset hover:text-ink"
                onClick={closePerson}
                aria-label="Close person details"
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

            {personDraft
              ? (
                <form
                  class="mt-6 grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    savePerson();
                  }}
                >
                  <label class="grid gap-1.5 text-sm font-medium">
                    Name
                    <input
                      value={personDraft.name}
                      onInput={(event) =>
                        setPersonDraft({
                          ...personDraft,
                          name: event.currentTarget.value,
                        })}
                      class="input"
                    />
                  </label>
                  <label class="grid gap-1.5 text-sm font-medium">
                    ID
                    <input
                      value={selectedPerson.id}
                      readOnly
                      class="input bg-inset font-mono text-xs text-ink-2"
                    />
                  </label>
                  <div class="grid grid-cols-2 gap-3">
                    <label class="grid gap-1.5 text-sm font-medium">
                      Born
                      <input
                        value={personDraft.born}
                        onInput={(event) =>
                          setPersonDraft({
                            ...personDraft,
                            born: event.currentTarget.value,
                          })}
                        placeholder="YYYY-MM-DD / MM-DD"
                        class="input min-w-0"
                      />
                    </label>
                    <label class="grid gap-1.5 text-sm font-medium">
                      Died
                      <input
                        value={personDraft.died}
                        onInput={(event) =>
                          setPersonDraft({
                            ...personDraft,
                            died: event.currentTarget.value,
                          })}
                        placeholder="YYYY-MM-DD"
                        class="input min-w-0"
                      />
                    </label>
                  </div>
                  <fieldset>
                    <legend class="text-sm font-medium">Families</legend>
                    <div class="mt-2 flex flex-wrap gap-2">
                      {Object.entries(groups).map(([key, group]) => (
                        <button
                          key={key}
                          type="button"
                          class="chip"
                          aria-pressed={personDraft.groups.includes(key)}
                          onClick={() => togglePersonGroup(key)}
                        >
                          {group.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <div class="relative grid gap-1.5 text-sm font-medium">
                    <label for="person-notes">Notes</label>
                    <textarea
                      id="person-notes"
                      ref={personNotesInput}
                      value={personDraft.notes}
                      onInput={(event) => {
                        setPersonDraft({
                          ...personDraft,
                          notes: event.currentTarget.value,
                        });
                        updatePersonMentionMenu(event.currentTarget);
                      }}
                      onClick={(event) => updatePersonMentionMenu(event.currentTarget)}
                      onKeyDown={(event) => {
                        if (!personMentionMenu) return;
                        const suggestions = personMentionSuggestions(personMentionMenu);
                        if (!suggestions.length) return;
                        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                          event.preventDefault();
                          const direction = event.key === "ArrowDown" ? 1 : -1;
                          setPersonMentionMenu({
                            ...personMentionMenu,
                            activeIndex:
                              (personMentionMenu.activeIndex + direction + suggestions.length) %
                              suggestions.length,
                          });
                        } else if (event.key === "Enter") {
                          event.preventDefault();
                          choosePersonMention(suggestions[personMentionMenu.activeIndex]);
                        } else if (event.key === "Escape") {
                          setPersonMentionMenu(null);
                        }
                      }}
                      onBlur={() => setTimeout(() => setPersonMentionMenu(null), 120)}
                      rows={5}
                      class="input resize-y leading-6"
                      placeholder="Optional; type @ to link a person"
                    />
                    {personMentionMenu &&
                      personMentionSuggestions(personMentionMenu).length > 0 && (
                      <div class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
                        {personMentionSuggestions(personMentionMenu).map((
                          person,
                          suggestionIndex,
                        ) => (
                          <button
                            key={person.id}
                            type="button"
                            class={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                              suggestionIndex === personMentionMenu.activeIndex
                                ? "bg-accent-soft text-accent-2"
                                : "hover:bg-inset"
                            }`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => choosePersonMention(person)}
                          >
                            <span class="font-medium">{person.name}</span>
                            <span class="font-mono text-xs text-ink-3">
                              @{person.id}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {personSaveError && (
                    <p class="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
                      {personSaveError}
                    </p>
                  )}
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      class="btn btn-ghost"
                      onClick={() => {
                        setPersonDraft(null);
                        setPersonSaveError("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      class="btn btn-primary"
                      disabled={personSaveState === "saving"}
                    >
                      {personSaveState === "saving" ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
              )
              : (
                <>
                  <dl class="mt-6 grid grid-cols-2 gap-2 text-sm">
                    <div class="rounded-lg bg-inset p-3">
                      <dt class="kicker">Born</dt>
                      <dd class="mt-1 font-medium tabular-nums">
                        {selectedDetail.born}
                      </dd>
                    </div>
                    <div class="rounded-lg bg-inset p-3">
                      <dt class="kicker">
                        {selectedPerson.died ? "Would be this year" : "Age this year"}
                      </dt>
                      <dd class="mt-1 font-medium tabular-nums">
                        {selectedDetail.age ?? "Unknown"}
                      </dd>
                    </div>
                    {selectedPerson.died && (
                      <>
                        <div class="rounded-lg bg-inset p-3">
                          <dt class="kicker">Died</dt>
                          <dd class="mt-1 font-medium tabular-nums">
                            {selectedPerson.died}
                          </dd>
                        </div>
                        <div class="rounded-lg bg-inset p-3">
                          <dt class="kicker">Age at death</dt>
                          <dd class="mt-1 font-medium tabular-nums">
                            {selectedDetail.ageAtDeath ?? "Unknown"}
                          </dd>
                        </div>
                      </>
                    )}
                    <div class="col-span-2 rounded-lg bg-inset p-3">
                      <dt class="kicker">Next birthday</dt>
                      <dd class="mt-1 font-medium tabular-nums">
                        {selectedDetail.next
                          ? `${selectedDetail.next} · ${relativeLabel(selectedDetail.next)}`
                          : "Unknown"}
                      </dd>
                    </div>
                    {selectedDetail.nextMemorial && (
                      <div class="col-span-2 rounded-lg bg-inset p-3">
                        <dt class="kicker">Next remembrance</dt>
                        <dd class="mt-1 font-medium tabular-nums">
                          {selectedDetail.nextMemorial} ·{" "}
                          {relativeLabel(selectedDetail.nextMemorial)}
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div class="mt-2 rounded-lg bg-inset p-3">
                    <p class="kicker">Notes</p>
                    <p class="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-ink-2">
                      {selectedPerson.notes ? linkedNotes(selectedPerson.notes) : "No notes yet."}
                    </p>
                  </div>

                  {(saveUrl || editUrl || selectedDetail.next) && (
                    <div class="mt-6 grid gap-2 sm:mt-auto">
                      {saveUrl && (
                        <button
                          type="button"
                          class="btn btn-ghost w-full"
                          onClick={() => startPersonEdit(selectedPerson)}
                        >
                          Edit person
                        </button>
                      )}
                      {!saveUrl && editUrl && (
                        <a
                          class="btn btn-ghost w-full"
                          href={`${editUrl}?person=${encodeURIComponent(selectedPerson.id)}`}
                        >
                          Edit person
                        </a>
                      )}
                      {selectedDetail.next && (
                        <button
                          type="button"
                          class="btn btn-primary w-full"
                          onClick={() => showPersonInTimeline(selectedPerson)}
                        >
                          Show next birthday in timeline
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
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
