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
    return "✨";
  }
  if (age! > 0 && age! % 10 === 0) return "✨";
  if (age! > 0 && age! % 5 === 0) return "⭐";
  return "";
}

function typeIcon(type: string): string {
  if (type === "memorial") return "🕯️";
  if (type === "anniversary") return "💍";
  return "🎂";
}

function typeLabel(type: string): string {
  if (type === "birthday") return "🎂 Birthdays";
  if (type === "memorial") return "🕯️ Remembrances";
  if (type === "anniversary") return "💍 Anniversaries";
  if (type === "holiday") return "🇳🇴🇩🇰 Holidays";
  return type;
}

function csvDateForMonthOffset(today: Date, offset: number): Date {
  return new Date(today.getFullYear(), today.getMonth() + offset, 1);
}

function countryPills(countries: Array<"NO" | "DK">) {
  return countries.map((country) => {
    const styles = country === "NO"
      ? "bg-[color:var(--blue-soft)] text-[color:var(--blue-ink)]"
      : "bg-[color:var(--red-soft)] text-[color:var(--red-ink)]";
    const flag = country === "NO" ? "🇳🇴" : "🇩🇰";
    return (
      <span class={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles}`}>
        {flag} {country}
      </span>
    );
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
    <details ref={details} class="filter-dropdown relative">
      <summary class="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-[color:var(--line-strong)] bg-white/70 px-4 py-2 text-sm font-semibold text-[color:var(--ink)] hover:bg-white">
        <span>{label}</span>
        <span class="text-xs font-medium text-[color:var(--soft-muted)]">
          {active.size}/{options.length}
        </span>
        <span class="ml-auto text-[10px] text-[color:var(--soft-muted)]" aria-hidden="true">
          ▼
        </span>
      </summary>
      <div class="absolute right-0 z-30 mt-2 min-w-56 rounded-2xl border border-[color:var(--line)] bg-[color:var(--paper-strong)] p-2 shadow-[var(--shadow)]">
        {options.map((option) => (
          <label
            key={option.key}
            class="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-black/[0.04]"
          >
            <input
              type="checkbox"
              checked={active.has(option.key)}
              onChange={() => onToggle(option.key)}
              class="size-4 accent-[color:var(--teal)]"
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
  const personLookup = useMemo(() => {
    const lookup = new Map<string, ViewPerson>();
    for (const person of people) {
      lookup.set(person.id.toLowerCase(), person);
      lookup.set(person.name.toLowerCase(), person);
      for (const alias of person.name.split("/")) lookup.set(alias.trim().toLowerCase(), person);
    }
    return lookup;
  }, [people]);

  useEffect(() => {
    setActiveTypes((current) => retainAvailable(current, allTypes));
  }, [allTypes]);
  useEffect(() => {
    setActiveGroups((current) => retainAvailable(current, Object.keys(groups)));
  }, [groups]);

  function monthDate(offset: number) {
    return csvDateForMonthOffset(today, offset);
  }

  function monthKey(offset: number) {
    const d = monthDate(offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
  const lastRenderedMonth = monthKey(firstMonthOffset + renderedMonthCount - 1);

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
      const summary = `${typeIcon(p.type)} ${p.name}`;
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
        class={`${
          highlight ? "next-highlight" : ""
        } flex items-center gap-3 rounded-xl border border-[color:var(--line)] bg-white/70 px-3 py-2.5 shadow-sm`}
      >
        <div class="grid size-11 place-items-center rounded-xl bg-[color:var(--teal-soft)] text-lg">
          {event.flare || typeIcon(event.type)}
        </div>
        <div class="min-w-0">
          <p class="truncate font-medium">
            <button
              type="button"
              class="text-left font-medium hover:underline"
              onClick={() => openPerson(event.person)}
            >
              {event.name}
            </button>
            {highlight && (
              <span class="text-xs font-semibold text-[color:var(--teal-ink)]">
                · next up
              </span>
            )}
          </p>
          <p class="text-sm text-[color:var(--muted)]">
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
        <div class="rounded-xl border border-[color:var(--line)] bg-white/70 px-3.5 py-3 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="font-medium text-[color:var(--ink)]">
              Holiday · {event.name}
            </p>
            <div class="flex gap-1">{countryPills(event.countries)}</div>
          </div>
        </div>
      );
    }
    if (event.type === "memorial") {
      const group = groups[event.person.group];
      return (
        <div
          id={`event-${event.person.id}-${event.date}-memorial`}
          class="rounded-xl border border-stone-300 bg-stone-100/80 px-3.5 py-3 shadow-sm"
        >
          <div class="flex items-start gap-3">
            <div class="grid size-10 shrink-0 place-items-center rounded-xl bg-stone-200 text-lg">
              🕯️
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
                  <span class="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-[color:var(--muted)]">
                    {group.flag} {group.label}
                  </span>
                )}
              </div>
              <p class="text-sm text-[color:var(--muted)]">
                Anniversary of their death
                {event.person.notes ? ` · ${event.person.notes}` : ""}
              </p>
            </div>
          </div>
        </div>
      );
    }
    const group = groups[event.person.group];
    const milestoneClass = event.flare
      ? "border-[color:var(--amber)] bg-[color:var(--amber-soft)]"
      : "border-[color:var(--line)] bg-white/80";
    return (
      <div
        id={`event-${event.person.id}-${event.date}`}
        class={`rounded-xl border ${milestoneClass} px-3.5 py-3 shadow-sm`}
      >
        <div class="flex items-start gap-3">
          <div class="grid size-10 shrink-0 place-items-center rounded-xl bg-[color:var(--teal-soft)] text-lg">
            {event.person.died ? "🕯️" : event.flare || typeIcon(event.type)}
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
                <span class="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold text-amber-950">
                  {event.age} {event.flare}
                </span>
              )}
              {group && (
                <span class="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-[color:var(--muted)]">
                  {group.flag} {group.label}
                </span>
              )}
            </div>
            <p class="text-sm text-[color:var(--muted)]">
              {[ageText(event), event.person.notes]
                .filter(Boolean)
                .join(" · ") || "Birthday"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  function linkedNotes(text: string) {
    const nodes = [];
    const regex = /\[\[([^\]]+)\]\]|@([a-z0-9-]+)/gi;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
      const wikiLabel = match[1]?.trim();
      const mentionId = match[2]?.toLowerCase();
      const label = wikiLabel ?? `@${mentionId}`;
      const linkedPerson = personLookup.get((wikiLabel ?? mentionId).toLowerCase());
      nodes.push(
        linkedPerson
          ? (
            <button
              type="button"
              class="font-semibold text-[color:var(--teal-ink)] underline decoration-[color:var(--teal)]/30 underline-offset-2 hover:decoration-[color:var(--teal)]"
              onClick={() => openPerson(linkedPerson)}
            >
              {wikiLabel ?? `@${linkedPerson.name}`}
            </button>
          )
          : wikiLabel
          ? `[[${label}]]`
          : label,
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
        class="grid gap-3 sm:grid-cols-[88px_1fr]"
        style={{ scrollMarginTop: "148px" }}
      >
        <div class="flex items-start gap-3 sm:block">
          <div
            class={`${
              isToday
                ? "day-dot bg-[color:var(--teal)] text-white"
                : "bg-[color:var(--paper-strong)] text-[color:var(--ink)]"
            } grid size-14 place-items-center rounded-2xl border border-[color:var(--line)] text-center shadow-sm`}
          >
            <div>
              <div class="text-lg font-semibold leading-none">
                {d.getDate()}
              </div>
              <div class="mt-1 text-[10px] font-medium uppercase">
                {dayFormatter.format(d).slice(0, 3)}
              </div>
            </div>
          </div>
          {isToday && (
            <span class="mt-4 rounded-full bg-[color:var(--teal-soft)] px-2.5 py-1 text-xs font-semibold text-[color:var(--teal-ink)] sm:mt-2 sm:inline-block">
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
              <div class="rounded-xl border border-dashed border-[color:var(--line-strong)] bg-white/50 px-3.5 py-3 text-sm text-[color:var(--soft-muted)]">
                Today
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
          class="action action-primary"
          onClick={scrollToToday}
        >
          Today
        </button>
      </AppHeader>

      <main class="mx-auto max-w-5xl px-4 pb-20 pt-6">
        <section class="mb-6 grid gap-3 sm:grid-cols-3">
          <article class="surface-raised rounded-2xl p-5">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--soft-muted)]">
              Birthdays this year
            </p>
            <div class="mt-4 flex items-end justify-between gap-3">
              <div>
                <p class="text-4xl font-semibold tracking-normal">
                  {birthdaysCelebratedThisYear}
                  <span class="text-2xl text-[color:var(--soft-muted)]">
                    /{birthdayPeopleThisYear.length}
                  </span>
                </p>
                <p class="mt-1 text-sm font-medium text-[color:var(--ink)]">
                  celebrated so far
                </p>
              </div>
              <div class="rounded-full bg-[color:var(--teal-soft)] px-3 py-1 text-sm font-semibold text-[color:var(--teal-ink)]">
                {birthdayProgressPercent}%
              </div>
            </div>
            <div
              class="mt-4 h-2 overflow-hidden rounded-full bg-[color:var(--line)]"
              aria-hidden="true"
            >
              <div
                class="h-full rounded-full bg-[color:var(--teal)]"
                style={{ width: `${birthdayProgressPercent}%` }}
              />
            </div>
            <p class="mt-3 text-sm text-[color:var(--muted)]">
              {birthdaysRemainingThisYear === 0
                ? "All known birthdays for this year are behind us."
                : `${birthdaysRemainingThisYear} still ahead this year`} · timeline through{" "}
              {lastRenderedMonth}
            </p>
          </article>
          <article class="surface-raised rounded-2xl p-5 sm:col-span-2">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--soft-muted)]">
                Next up
              </p>
              <p class="text-xs text-[color:var(--soft-muted)]">
                next 120 days
              </p>
            </div>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
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
                  <p class="text-sm text-[color:var(--muted)]">
                    Nothing in the next 120 days for this filter.
                  </p>
                )}
            </div>
          </article>
        </section>

        <section class="mb-6 grid gap-3 lg:grid-cols-[1fr_0.72fr]">
          <article class="surface rounded-2xl p-5">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--soft-muted)]">
              Recently celebrated
            </p>
            <div class="mt-3 grid gap-2">
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
                  <p class="text-sm text-[color:var(--muted)]">
                    Nothing in the last 90 days for this filter.
                  </p>
                )}
            </div>
          </article>
          <article class="surface rounded-2xl p-5">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--soft-muted)]">
              Missing dates
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              {missing.length
                ? (
                  missing.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openPerson(p)}
                      class="rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-1 text-sm font-medium text-[color:var(--muted)] hover:bg-white hover:text-[color:var(--ink)]"
                      title={p.notes}
                    >
                      {p.name}
                    </button>
                  ))
                )
                : (
                  <p class="text-sm text-[color:var(--muted)]">
                    All dates filled in 🎉
                  </p>
                )}
            </div>
          </article>
        </section>

        <section class="surface mb-4 rounded-2xl p-4">
          <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label class="relative block w-full lg:max-w-xs">
              <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--soft-muted)]">
                🔍
              </span>
              <input
                type="search"
                value={query}
                onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
                placeholder="Search by name or note…"
                class="w-full rounded-full border border-[color:var(--line-strong)] bg-white/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-[color:var(--teal)]"
              />
            </label>
            <div class="flex flex-wrap items-center gap-2">
              <FilterDropdown
                label="Families"
                options={Object.entries(groups).map(([key, group]) => ({
                  key,
                  label: `${group.flag} ${group.label}`,
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
          </div>
        </section>

        <div class="mb-4 flex justify-center">
          <button
            type="button"
            onClick={loadPastEvents}
            disabled={firstMonthOffset <= -maxPastMonths}
            class="rounded-full border border-[color:var(--line-strong)] bg-white/70 px-4 py-2 text-sm font-semibold text-[color:var(--teal-ink)] shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
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
                  style={{ scrollMarginTop: "96px" }}
                >
                  <div class="month-bar sticky top-[73px] z-10 -mx-4 border-y px-4 py-3 backdrop-blur-xl">
                    <div class="mx-auto flex max-w-5xl items-center justify-between">
                      <h2 class="text-lg font-semibold">
                        {monthFormatter.format(m.date)}
                      </h2>
                      <span class="text-sm font-medium text-[color:var(--soft-muted)]">
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
              <p class="rounded-2xl border border-dashed border-[color:var(--line-strong)] bg-white/50 p-6 text-center text-sm text-[color:var(--soft-muted)]">
                No events match the current filters.
              </p>
            )}
          <div class="py-6 text-center text-sm text-[color:var(--soft-muted)]">
            Scroll for more months…
          </div>
        </section>
      </main>

      {selectedPerson && selectedDetail && (
        <div
          class={`person-backdrop fixed inset-0 z-40 flex items-end bg-black/25 sm:items-stretch sm:justify-end ${
            personClosing ? "is-closing" : ""
          }`}
          onClick={closePerson}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="person-detail-title"
            class={`person-sheet flex max-h-[88vh] w-full flex-col overflow-y-auto rounded-t-3xl border border-[color:var(--line)] bg-[color:var(--paper-strong)] p-5 shadow-[var(--shadow)] sm:max-h-none sm:w-[28rem] sm:rounded-none sm:border-y-0 sm:border-r-0 ${
              personOpen ? "is-open" : ""
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div class="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[color:var(--line-strong)] sm:hidden" />
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="eyebrow text-xs font-semibold uppercase">Person</p>
                <h2 id="person-detail-title" class="mt-1 text-2xl font-semibold">
                  {selectedPerson.name}
                </h2>
                {selectedDetail.group && (
                  <p class="mt-2 text-sm text-[color:var(--muted)]">
                    {selectedDetail.group.flag} {selectedDetail.group.label}
                  </p>
                )}
              </div>
              <button
                ref={closePersonButton}
                type="button"
                class="rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-1 text-sm font-semibold text-[color:var(--muted)] hover:text-[color:var(--ink)]"
                onClick={closePerson}
                aria-label="Close person details"
              >
                Close
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
                      class="rounded-xl border border-[color:var(--line-strong)] bg-white/80 px-3 py-2.5 outline-none focus:border-[color:var(--teal)]"
                    />
                  </label>
                  <label class="grid gap-1.5 text-sm font-medium">
                    ID
                    <input
                      value={selectedPerson.id}
                      readOnly
                      class="rounded-xl border border-[color:var(--line)] bg-black/[0.035] px-3 py-2.5 font-mono text-xs text-[color:var(--muted)]"
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
                        class="min-w-0 rounded-xl border border-[color:var(--line-strong)] bg-white/80 px-3 py-2.5 outline-none focus:border-[color:var(--teal)]"
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
                        class="min-w-0 rounded-xl border border-[color:var(--line-strong)] bg-white/80 px-3 py-2.5 outline-none focus:border-[color:var(--teal)]"
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
                          {group.flag} {group.label}
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
                      class="resize-y rounded-xl border border-[color:var(--line-strong)] bg-white/80 px-3 py-2.5 leading-6 outline-none focus:border-[color:var(--teal)]"
                      placeholder="Optional; type @ to link a person"
                    />
                    {personMentionMenu &&
                      personMentionSuggestions(personMentionMenu).length > 0 && (
                      <div class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-[color:var(--line)] bg-white shadow-[var(--shadow)]">
                        {personMentionSuggestions(personMentionMenu).map((
                          person,
                          suggestionIndex,
                        ) => (
                          <button
                            key={person.id}
                            type="button"
                            class={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                              suggestionIndex === personMentionMenu.activeIndex
                                ? "bg-[color:var(--teal-soft)] text-[color:var(--teal-ink)]"
                                : "hover:bg-black/[0.03]"
                            }`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => choosePersonMention(person)}
                          >
                            <span class="font-medium">{person.name}</span>
                            <span class="font-mono text-xs text-[color:var(--soft-muted)]">
                              @{person.id}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {personSaveError && (
                    <p class="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                      {personSaveError}
                    </p>
                  )}
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      class="action action-secondary"
                      onClick={() => {
                        setPersonDraft(null);
                        setPersonSaveError("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      class="action action-primary"
                      disabled={personSaveState === "saving"}
                    >
                      {personSaveState === "saving" ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
              )
              : (
                <>
                  <dl class="mt-6 grid grid-cols-2 gap-3 text-sm">
                    <div class="rounded-xl border border-[color:var(--line)] bg-white/60 p-3">
                      <dt class="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--soft-muted)]">
                        Born
                      </dt>
                      <dd class="mt-1 font-medium text-[color:var(--ink)]">
                        {selectedDetail.born}
                      </dd>
                    </div>
                    <div class="rounded-xl border border-[color:var(--line)] bg-white/60 p-3">
                      <dt class="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--soft-muted)]">
                        {selectedPerson.died ? "Would be this year" : "Age this year"}
                      </dt>
                      <dd class="mt-1 font-medium text-[color:var(--ink)]">
                        {selectedDetail.age ?? "Unknown"}
                      </dd>
                    </div>
                    {selectedPerson.died && (
                      <>
                        <div class="rounded-xl border border-[color:var(--line)] bg-white/60 p-3">
                          <dt class="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--soft-muted)]">
                            Died
                          </dt>
                          <dd class="mt-1 font-medium text-[color:var(--ink)]">
                            {selectedPerson.died}
                          </dd>
                        </div>
                        <div class="rounded-xl border border-[color:var(--line)] bg-white/60 p-3">
                          <dt class="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--soft-muted)]">
                            Age at death
                          </dt>
                          <dd class="mt-1 font-medium text-[color:var(--ink)]">
                            {selectedDetail.ageAtDeath ?? "Unknown"}
                          </dd>
                        </div>
                      </>
                    )}
                    <div class="col-span-2 rounded-xl border border-[color:var(--line)] bg-white/60 p-3">
                      <dt class="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--soft-muted)]">
                        Next birthday
                      </dt>
                      <dd class="mt-1 font-medium text-[color:var(--ink)]">
                        {selectedDetail.next
                          ? `${selectedDetail.next} · ${relativeLabel(selectedDetail.next)}`
                          : "Unknown"}
                      </dd>
                    </div>
                    {selectedDetail.nextMemorial && (
                      <div class="col-span-2 rounded-xl border border-[color:var(--line)] bg-white/60 p-3">
                        <dt class="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--soft-muted)]">
                          Next remembrance
                        </dt>
                        <dd class="mt-1 font-medium text-[color:var(--ink)]">
                          {selectedDetail.nextMemorial} ·{" "}
                          {relativeLabel(selectedDetail.nextMemorial)}
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div class="mt-6 rounded-2xl border border-[color:var(--line)] bg-white/60 p-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--soft-muted)]">
                      Notes
                    </p>
                    <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted)]">
                      {selectedPerson.notes ? linkedNotes(selectedPerson.notes) : "No notes yet."}
                    </p>
                  </div>

                  {(saveUrl || editUrl || selectedDetail.next) && (
                    <div class="mt-6 grid gap-2 sm:mt-auto">
                      {saveUrl && (
                        <button
                          type="button"
                          class="action action-secondary w-full"
                          onClick={() => startPersonEdit(selectedPerson)}
                        >
                          Edit person
                        </button>
                      )}
                      {!saveUrl && editUrl && (
                        <a
                          class="action action-secondary w-full"
                          href={`${editUrl}?person=${encodeURIComponent(selectedPerson.id)}`}
                        >
                          Edit person
                        </a>
                      )}
                      {selectedDetail.next && (
                        <button
                          type="button"
                          class="action action-primary w-full"
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
        class={`toast fixed bottom-4 left-1/2 z-30 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-[color:var(--line)] bg-[color:var(--paper-strong)] px-4 py-3 text-sm text-[color:var(--ink)] shadow-[var(--shadow)] ${
          toast ? "visible" : ""
        }`}
      >
        {toast}
      </div>
    </>
  );
}
