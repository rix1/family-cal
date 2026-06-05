import type { CalendarViewData, ViewPerson } from "@/lib/view_data.ts";
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
  if (type === "anniversary") return "💍";
  return "🎂";
}

function typeLabel(type: string): string {
  if (type === "birthday") return "🎂 Birthdays";
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

export function Calendar({ groups, people, holidays }: CalendarViewData) {
  const [query, setQuery] = useState("");
  const allTypes = useMemo(
    () =>
      Array.from(
        new Set([...people.map((p) => p.type || "birthday"), "holiday"]),
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
  const pendingScrollToPerson = useRef<ViewPerson | null>(null);
  const restoreScroll = useRef<{ y: number; height: number } | null>(null);

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

  useEffect(() => setActiveTypes(new Set(allTypes)), [allTypes]);
  useEffect(() => setActiveGroups(new Set(Object.keys(groups))), [groups]);

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
        if (!person.date) continue;
        const md = monthDayOf(person);
        const date = `${year}-${md}`;
        if (hasYear(person) && date < person.date) continue;
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
      if (event.type === "birthday" && !activeGroups.has(event.person.group)) {
        return false;
      }
      if (q) {
        const haystack = event.type === "birthday"
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

  function toggle(
    setter: (s: Set<string>) => void,
    current: Set<string>,
    key: string,
    fallback: string[],
  ) {
    const next = new Set(current);
    next.has(key) ? next.delete(key) : next.add(key);
    if (!next.size) fallback.forEach((x) => next.add(x));
    setter(next);
  }

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
    (e) => e.type !== "holiday" && e.date >= todayKey,
  );
  const nextWindow = upcoming
    .filter((e) => e.date <= toKey(addDays(today, 120)))
    .slice(0, 6) as Extract<CalendarEvent, { type: "birthday" }>[];
  const recent = events
    .filter(
      (e) =>
        e.type !== "holiday" &&
        e.date < todayKey &&
        e.date >= toKey(addDays(today, -90)),
    )
    .reverse()
    .slice(0, 5) as Extract<CalendarEvent, { type: "birthday" }>[];
  const missing = people.filter((p) => !p.date && activeGroups.has(p.group));
  const birthdayPeopleThisYear = people.filter((person) => {
    if (!person.date || !activeGroups.has(person.group)) return false;
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

  function openPerson(person: ViewPerson) {
    setSelectedPerson(person);
    const next = nextBirthdayDate(person);
    if (next) {
      const targetYear = Number(next.slice(0, 4));
      const targetMonth = Number(next.slice(5, 7)) - 1;
      const monthsAhead = (targetYear - currentYear) * 12 + (targetMonth - today.getMonth());
      if (monthsAhead >= firstMonthOffset + renderedMonthCount) {
        setRenderedMonthCount(monthsAhead - firstMonthOffset + 1);
      }
      pendingScrollToPerson.current = person;
    }
  }

  useEffect(() => {
    const person = pendingScrollToPerson.current;
    if (!person) return;
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
    const regex = /\[\[([^\]]+)\]\]/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
      const label = match[1].trim();
      const linkedPerson = personLookup.get(label.toLowerCase());
      nodes.push(
        linkedPerson
          ? (
            <button
              type="button"
              class="font-semibold text-[color:var(--teal-ink)] underline decoration-[color:var(--teal)]/30 underline-offset-2 hover:decoration-[color:var(--teal)]"
              onClick={() => openPerson(linkedPerson)}
            >
              {label}
            </button>
          )
          : `[[${label}]]`,
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes.length ? nodes : text;
  }

  function personDetail(person: ViewPerson) {
    const next = nextBirthdayDate(person);
    const group = groups[person.group];
    const age = hasYear(person) ? currentYear - Number(person.date.slice(0, 4)) : null;
    const born = person.date || "Unknown";
    return { next, group, age, born };
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
      <header class="topbar sticky top-0 z-20 border-b backdrop-blur-xl">
        <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div class="min-w-0">
            <p class="eyebrow text-xs font-semibold uppercase">
              Family calendar
            </p>
            <h1 class="mt-1 truncate text-xl font-semibold tracking-normal sm:text-2xl">
              {longDateFormatter.format(today)}
            </h1>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <a
              href="/about"
              class="action action-secondary"
              title="About and API docs"
            >
              <span aria-hidden="true">ℹ️</span>
              <span class="hidden sm:inline">About</span>
            </a>
            <a
              href="/edit.html"
              class="action action-secondary"
              title="Add or edit people"
            >
              <span aria-hidden="true">✏️</span>
              <span class="hidden sm:inline">Edit</span>
            </a>
            <button
              type="button"
              class="action action-secondary"
              onClick={downloadIcs}
              title="Download an .ics file"
            >
              <span aria-hidden="true">📆</span>
              <span class="hidden sm:inline">Export .ics</span>
            </button>
            <button
              type="button"
              class="action action-primary"
              onClick={scrollToToday}
            >
              Today
            </button>
          </div>
        </div>
      </header>

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
              <div class="flex flex-wrap items-center gap-2">
                {Object.entries(groups).map(([key, g]) => (
                  <button
                    key={key}
                    type="button"
                    class="chip"
                    aria-pressed={activeGroups.has(key)}
                    onClick={() =>
                      toggle(
                        setActiveGroups,
                        activeGroups,
                        key,
                        Object.keys(groups),
                      )}
                  >
                    {g.flag} {g.label}
                  </button>
                ))}
              </div>
              <span class="hidden h-5 w-px bg-[color:var(--line-strong)] sm:inline-block"></span>
              <div class="flex flex-wrap items-center gap-2">
                {allTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    class="chip"
                    aria-pressed={activeTypes.has(type)}
                    onClick={() => toggle(setActiveTypes, activeTypes, type, allTypes)}
                  >
                    {typeLabel(type)}
                  </button>
                ))}
              </div>
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
        <aside class="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[color:var(--line)] bg-[color:var(--paper-strong)] p-5 shadow-[var(--shadow)] sm:w-[28rem]">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="eyebrow text-xs font-semibold uppercase">Person</p>
              <h2 class="mt-1 text-2xl font-semibold">{selectedPerson.name}</h2>
              {selectedDetail.group && (
                <p class="mt-2 text-sm text-[color:var(--muted)]">
                  {selectedDetail.group.flag} {selectedDetail.group.label}
                </p>
              )}
            </div>
            <button
              type="button"
              class="rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-1 text-sm font-semibold text-[color:var(--muted)] hover:text-[color:var(--ink)]"
              onClick={() => setSelectedPerson(null)}
              aria-label="Close person details"
            >
              Close
            </button>
          </div>

          <dl class="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-xl border border-[color:var(--line)] bg-white/60 p-3">
              <dt class="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--soft-muted)]">
                Born
              </dt>
              <dd class="mt-1 font-medium text-[color:var(--ink)]">{selectedDetail.born}</dd>
            </div>
            <div class="rounded-xl border border-[color:var(--line)] bg-white/60 p-3">
              <dt class="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--soft-muted)]">
                Age this year
              </dt>
              <dd class="mt-1 font-medium text-[color:var(--ink)]">
                {selectedDetail.age ?? "Unknown"}
              </dd>
            </div>
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
          </dl>

          <div class="mt-6 rounded-2xl border border-[color:var(--line)] bg-white/60 p-4">
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--soft-muted)]">
              Notes
            </p>
            <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted)]">
              {selectedPerson.notes ? linkedNotes(selectedPerson.notes) : "No notes yet."}
            </p>
          </div>

          <p class="mt-auto pt-6 text-xs text-[color:var(--soft-muted)]">
            Opening a person scrolls the list to their next visible birthday.
          </p>
        </aside>
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
