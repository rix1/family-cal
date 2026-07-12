import { AppHeader, MenuIcon } from "@/components/AppHeader.tsx";
import type { SavedGroup } from "@/islands/PersonForm.tsx";
import { localizedMonthNames } from "@/lib/dates.ts";
import { retainAvailable, toggleSelection } from "@/lib/filter_selection.ts";
import { dateLocale, t } from "@/lib/i18n.ts";
import type { CalendarViewData, ViewEvent, ViewPerson } from "@/lib/view_data.ts";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  addDays,
  firstOfMonthOffset,
  longDateFormat,
  monthFormat,
  toKey,
} from "@/lib/calendar/dates.ts";
import {
  ageOn,
  hasYear,
  monthDayOf,
  nextBirthdayDate,
  personDetail,
} from "@/lib/calendar/people.ts";
import {
  type BirthdayEvent,
  buildRawEvents,
  buildTableRows,
  type CalendarEvent,
  filterEvents,
  sortTableRows,
  type TableSort,
  type TableSortKey,
} from "@/lib/calendar/events.ts";
import { typeLabel } from "@/lib/calendar/labels.ts";
import { buildIcs } from "@/lib/calendar/ics.ts";
import { FilterDropdown } from "@/components/calendar/FilterDropdown.tsx";
import { CheckIcon, ListIcon, SparkIcon, TableIcon } from "@/components/calendar/icons.tsx";
import { PersonSheet } from "@/components/calendar/PersonSheet.tsx";
import { CalendarTable } from "@/components/calendar/table.tsx";
import { DayGroup, SummaryCard, type TimelineContext } from "@/components/calendar/timeline.tsx";
import { weekCells, YearHeatmap } from "@/components/calendar/YearHeatmap.tsx";

const monthBatchSize = 12;
const maxPastMonths = 120;

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
  // Remembrances are opt-in: the default view stays celebratory; the
  // "show" dropdown toggles them back on.
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    () => new Set(allTypes.filter((type) => type !== "memorial")),
  );
  const [firstMonthOffset, setFirstMonthOffset] = useState(0);
  const [renderedMonthCount, setRenderedMonthCount] = useState(24);
  const [viewMode, setViewMode] = useState<"timeline" | "table">("timeline");
  const [tableSort, setTableSort] = useState<TableSort>({
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
    return firstOfMonthOffset(today, offset);
  }

  const rawEvents = useMemo(() => {
    const start = monthDate(firstMonthOffset);
    const end = monthDate(firstMonthOffset + renderedMonthCount - 1);
    const startYear = Math.min(currentYear - 1, start.getFullYear());
    return buildRawEvents(people, holidays, occasions, startYear, end.getFullYear());
  }, [people, holidays, occasions, firstMonthOffset, renderedMonthCount]);

  const events = useMemo(
    () => filterEvents(rawEvents, activeGroups, activeTypes, query),
    [rawEvents, activeGroups, activeTypes, query],
  );

  const tableRows = useMemo(() => buildTableRows(events, todayKey), [events, todayKey]);
  const sortedTableRows = useMemo(
    () => sortTableRows(tableRows, tableSort),
    [tableRows, tableSort],
  );

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

  const upcoming = events.filter(
    (e) => e.type === "birthday" && !e.person.died && e.date >= todayKey,
  );
  const nextWindow = upcoming
    .filter((e) => e.date <= toKey(addDays(today, 120)))
    .slice(0, 6) as BirthdayEvent[];
  const recent = events
    .filter(
      (e) =>
        e.type === "birthday" &&
        !e.person.died &&
        e.date < todayKey &&
        e.date >= toKey(addDays(today, -90)),
    )
    .reverse()
    .slice(0, 5) as BirthdayEvent[];
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
    const next = nextBirthdayDate(person, currentYear, todayKey);
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
    const next = nextBirthdayDate(person, currentYear, todayKey);
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

  function downloadIcs() {
    const { ics, count } = buildIcs({
      people,
      occasions,
      activeGroups,
      activeTypes,
      query,
      today,
    });
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

  const selectedDetail = selectedPerson
    ? personDetail(selectedPerson, people, currentYear, todayKey)
    : null;

  const timelineCtx: TimelineContext = {
    todayKey,
    groups,
    personLookup,
    onOpenPerson: openPerson,
  };

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
        title={longDateFormat().format(today)}
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
              /* Year heatmap experiment: delete this <div> plus YearHeatmap.tsx
                and the heatmap memos above to remove it cleanly. */
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
              <YearHeatmap cells={heatmapCells} />
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
                      ctx={timelineCtx}
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
                      ctx={timelineCtx}
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
          <CalendarTable
            rows={sortedTableRows}
            groups={groups}
            sort={tableSort}
            onToggleSort={toggleTableSort}
            personLookup={personLookup}
            onOpenPerson={openPerson}
          />
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
                        {monthFormat().format(m.date)}
                      </h2>
                      <span class="text-xs tabular-nums text-ink-3">
                        {m.events.length}{" "}
                        {m.events.length === 1 ? t("calendar.eventOne") : t("calendar.eventOther")}
                      </span>
                    </div>
                  </div>
                  <div class="mt-4 space-y-4">
                    {m.days.map(([date, dayEvents]) => (
                      <DayGroup key={date} dateKey={date} dayEvents={dayEvents} ctx={timelineCtx} />
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
        <PersonSheet
          open={personOpen}
          closing={personClosing}
          person={selectedPerson}
          detail={selectedDetail}
          adding={adding}
          addingEvent={addingEvent}
          editing={editing}
          groups={groups}
          people={people}
          personalKey={personalKey}
          saveUrl={saveUrl}
          eventsSaveUrl={eventsSaveUrl}
          editUrl={editUrl}
          todayKey={todayKey}
          personLookup={personLookup}
          onOpenPerson={openPerson}
          onClose={closeSheet}
          onEditPerson={openEditPerson}
          onPersonSaved={onPersonSaved}
          onEventSaved={onEventSaved}
          onCancelForm={cancelForm}
          onShowInTimeline={showPersonInTimeline}
          closeButtonRef={closePersonButton}
        />
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
